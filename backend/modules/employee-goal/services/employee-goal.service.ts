import "server-only";

import mongoose, {
  Types,
  type ClientSession,
  type HydratedDocument,
} from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { assertPermission } from "../../authorization/services/permission.service";
import { canAccessEmployee } from "../../authorization/services/scope.service";
import {
  recordHistoryChange,
  type AuditContext,
} from "../../history-change/services/history.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { EmployeeModel, type Employee } from "../../employee/entities/employee.entity";
import type { Goal } from "../../goal/entities/goal.entity";
import { goalExistsForAssignment } from "../../goal/services/goal.service";
import {
  type EmployeeGoal,
  type GoalRulesSnapshot,
} from "../entities/employee-goal.entity";
import {
  createEmployeeGoalRecord,
  findEmployeeGoalByUniqueKey,
  findEmployeeGoalRecord,
  listEmployeeGoalRecords,
  updateEmployeeGoalRecord,
} from "../repository/employee-goal.repository";
import {
  EmployeeGoalAccessError,
  EmployeeGoalConflictError,
  EmployeeGoalNotFoundError,
  EmployeeGoalValidationError,
} from "./employee-goal.errors";
import { calculateMonthPeriod } from "./period.service";
import type {
  ChangeEmployeeGoalStatusInput,
  CreateEmployeeGoalInput,
} from "../types/employee-goal.types";

type EmployeeGoalDocument = HydratedDocument<EmployeeGoal>;
type EmployeeDocument = HydratedDocument<Employee>;
type GoalDocument = HydratedDocument<Goal>;

export function validateEmployeeGoalNumbers(input: {
  year: number;
  month: number;
  target_value: number;
}): void {
  if (!Number.isInteger(input.year)) {
    throw new EmployeeGoalValidationError("year must be an integer");
  }

  if (
    !Number.isInteger(input.month) ||
    input.month < 1 ||
    input.month > 12
  ) {
    throw new EmployeeGoalValidationError("month must be between 1 and 12");
  }

  if (!Number.isInteger(input.target_value) || input.target_value <= 0) {
    throw new EmployeeGoalValidationError(
      "target_value must be a positive integer",
    );
  }
}

export function isEmployeeEligibleForGoalAssignment(employee: {
  status: string;
  deleted_at: Date | null;
}): boolean {
  return employee.deleted_at === null && employee.status === "ACTIVE";
}

export function buildGoalRulesSnapshot(goal: {
  name: string;
  activity_type_id: Types.ObjectId;
  aggregation: "COUNT";
  required_activity_status: "COMPLETED";
  offer_id: Types.ObjectId | null;
  version: number;
}): GoalRulesSnapshot {
  return {
    goal_name: goal.name,
    activity_type_id: goal.activity_type_id,
    aggregation: goal.aggregation,
    required_activity_status: goal.required_activity_status,
    offer_id: goal.offer_id,
    goal_version: goal.version,
  };
}

function buildAuditContext(
  context: AuthContext,
  requestId: string,
): AuditContext {
  return {
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    actor_user_id: context.account_id,
    request_id: requestId,
    reason: null,
  };
}

function employeeGoalSnapshot(
  employeeGoal: EmployeeGoalDocument,
): Record<string, unknown> {
  return {
    employee_id: employeeGoal.employee_id.toString(),
    goal_id: employeeGoal.goal_id.toString(),
    year: employeeGoal.year,
    month: employeeGoal.month,
    timezone: employeeGoal.timezone,
    period_start: employeeGoal.period_start,
    period_end: employeeGoal.period_end,
    target_value: employeeGoal.target_value,
    status: employeeGoal.status,
    rules_snapshot: {
      goal_name: employeeGoal.rules_snapshot.goal_name,
      activity_type_id:
        employeeGoal.rules_snapshot.activity_type_id.toString(),
      aggregation: employeeGoal.rules_snapshot.aggregation,
      required_activity_status:
        employeeGoal.rules_snapshot.required_activity_status,
      offer_id:
        employeeGoal.rules_snapshot.offer_id?.toString() ?? null,
      goal_version: employeeGoal.rules_snapshot.goal_version,
    },
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function withTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  await connectToDatabase();
  const session = await mongoose.startSession();

  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export function assertEmployeeGoalVersion(
  currentVersion: number,
  expectedVersion: number,
): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new EmployeeGoalValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  if (currentVersion !== expectedVersion) {
    throw new EmployeeGoalConflictError("Version conflict");
  }
}

export function assertEmployeeGoalStatusTransition(
  currentStatus: "ACTIVE" | "CANCELLED",
  targetStatus: "ACTIVE" | "CANCELLED",
): void {
  if (currentStatus === targetStatus) {
    throw new EmployeeGoalConflictError(
      targetStatus === "CANCELLED"
        ? "Employee goal is already cancelled"
        : "Employee goal is already active",
    );
  }
}

async function findEmployee(
  context: AuthContext,
  employeeId: Types.ObjectId,
): Promise<EmployeeDocument | null> {
  return EmployeeModel.findOne({
    _id: employeeId,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
  });
}

async function findEmployeeById(
  context: AuthContext,
  employeeId: Types.ObjectId,
): Promise<EmployeeDocument> {
  const employee = await findEmployee(context, employeeId);

  if (!employee) {
    throw new EmployeeGoalValidationError("Employee not found");
  }

  return employee;
}

async function loadAccessibleEmployeeIds(
  context: AuthContext,
): Promise<Types.ObjectId[] | null> {
  if (context.account_type === "PARTNER") {
    return null;
  }

  if (!context.employee_id) {
    return [];
  }

  const employees = await EmployeeModel.find({
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    $or: [
      { _id: context.employee_id },
      { supervisor_id: context.employee_id },
    ],
  })
    .select("_id")
    .lean();

  return employees.map((employee) => employee._id);
}

async function loadScopedEmployeeGoal(
  context: AuthContext,
  employeeGoalId: Types.ObjectId,
): Promise<{
  employeeGoal: EmployeeGoalDocument;
  employee: EmployeeDocument;
}> {
  const employeeGoal = await findEmployeeGoalRecord({
    _id: employeeGoalId,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
  });

  if (!employeeGoal) {
    throw new EmployeeGoalNotFoundError();
  }

  const employee = await findEmployee(context, employeeGoal.employee_id);

  if (!employee || !canAccessEmployee(context, employee)) {
    throw new EmployeeGoalNotFoundError();
  }

  return { employeeGoal, employee };
}

async function loadAssignableGoal(
  context: AuthContext,
  goalId: Types.ObjectId,
): Promise<GoalDocument> {
  const goal = await goalExistsForAssignment(context, goalId);

  if (!goal) {
    throw new EmployeeGoalValidationError(
      "Goal not found, inactive, or deleted",
    );
  }

  return goal;
}

export async function listEmployeeGoals(
  context: AuthContext,
): Promise<EmployeeGoalDocument[]> {
  await assertPermission(context, "GOAL_LIST");

  const filter: Record<string, unknown> = {
    organization_id: context.organization_id,
    partner_id: context.partner_id,
  };
  const employeeIds = await loadAccessibleEmployeeIds(context);

  if (employeeIds !== null) {
    filter.employee_id = { $in: employeeIds };
  }

  return listEmployeeGoalRecords(filter);
}

export async function getEmployeeGoal(
  context: AuthContext,
  employeeGoalId: Types.ObjectId,
): Promise<EmployeeGoalDocument> {
  await assertPermission(context, "GOAL_READ");

  const { employeeGoal } = await loadScopedEmployeeGoal(
    context,
    employeeGoalId,
  );
  return employeeGoal;
}

export async function createEmployeeGoal(
  context: AuthContext,
  input: CreateEmployeeGoalInput,
  requestId: string,
): Promise<EmployeeGoalDocument> {
  await assertPermission(context, "GOAL_ASSIGN");
  validateEmployeeGoalNumbers(input);

  const targetEmployeeId = input.employee_id ?? context.employee_id;

  if (!targetEmployeeId) {
    throw new EmployeeGoalValidationError("employee_id is required");
  }

  const employee = await findEmployeeById(context, targetEmployeeId);

  if (!canAccessEmployee(context, employee)) {
    throw new EmployeeGoalAccessError(
      "Employee is outside your data scope",
    );
  }

  if (!isEmployeeEligibleForGoalAssignment(employee)) {
    throw new EmployeeGoalValidationError(
      "Employee must be ACTIVE and not deleted to receive goals",
    );
  }

  const goal = await loadAssignableGoal(context, input.goal_id);
  const uniqueFilter = {
    organizationId: context.organization_id,
    partnerId: context.partner_id,
    employeeId: employee._id,
    goalId: goal._id,
    year: input.year,
    month: input.month,
  };

  const existing = await findEmployeeGoalByUniqueKey(uniqueFilter);

  if (existing) {
    throw new EmployeeGoalConflictError(
      "Employee goal already exists for that month",
    );
  }

  const period = calculateMonthPeriod(
    input.year,
    input.month,
    context.timezone,
  );
  const rulesSnapshot = buildGoalRulesSnapshot(goal);
  const auditContext = buildAuditContext(context, requestId);

  try {
    return await withTransaction(async (session) => {
      const existingInTransaction = await findEmployeeGoalByUniqueKey(
        uniqueFilter,
        session,
      );

      if (existingInTransaction) {
        throw new EmployeeGoalConflictError(
          "Employee goal already exists for that month",
        );
      }

      const employeeGoal = await createEmployeeGoalRecord(
        {
          organization_id: context.organization_id,
          partner_id: context.partner_id,
          employee_id: employee._id,
          goal_id: goal._id,
          year: input.year,
          month: input.month,
          timezone: context.timezone,
          period_start: period.period_start,
          period_end: period.period_end,
          target_value: input.target_value,
          status: "ACTIVE",
          rules_snapshot: rulesSnapshot,
          created_by: context.account_id,
          updated_by: context.account_id,
          version: 0,
        },
        session,
      );

      await recordHistoryChange(session, auditContext, {
        entity_name: "employee_goal",
        record_id: employeeGoal._id,
        action: "CREATE",
        previous_values: null,
        new_values: employeeGoalSnapshot(employeeGoal),
      });

      return employeeGoal;
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new EmployeeGoalConflictError(
        "Employee goal already exists for that month",
      );
    }
    throw error;
  }
}

async function changeEmployeeGoalStatus(
  context: AuthContext,
  employeeGoalId: Types.ObjectId,
  input: ChangeEmployeeGoalStatusInput,
  targetStatus: "ACTIVE" | "CANCELLED",
  requestId: string,
): Promise<EmployeeGoalDocument> {
  await assertPermission(context, "GOAL_ASSIGN");

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new EmployeeGoalValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const { employeeGoal } = await loadScopedEmployeeGoal(
    context,
    employeeGoalId,
  );

  assertEmployeeGoalVersion(employeeGoal.version, input.expectedVersion);
  assertEmployeeGoalStatusTransition(employeeGoal.status, targetStatus);

  const auditContext = buildAuditContext(context, requestId);

  return withTransaction(async (session) => {
    const updated = await updateEmployeeGoalRecord(
      {
        _id: employeeGoalId,
        organization_id: context.organization_id,
        partner_id: context.partner_id,
        version: input.expectedVersion,
        status: employeeGoal.status,
      },
      {
        status: targetStatus,
        updated_by: context.account_id,
      },
      session,
    );

    if (!updated) {
      throw new EmployeeGoalConflictError("Version conflict");
    }

    await recordHistoryChange(session, auditContext, {
      entity_name: "employee_goal",
      record_id: updated._id,
      action: "UPDATE",
      previous_values: { status: employeeGoal.status },
      new_values: { status: targetStatus },
    });

    return updated;
  });
}

export async function cancelEmployeeGoal(
  context: AuthContext,
  employeeGoalId: Types.ObjectId,
  input: ChangeEmployeeGoalStatusInput,
  requestId: string,
): Promise<EmployeeGoalDocument> {
  return changeEmployeeGoalStatus(
    context,
    employeeGoalId,
    input,
    "CANCELLED",
    requestId,
  );
}

export async function reactivateEmployeeGoal(
  context: AuthContext,
  employeeGoalId: Types.ObjectId,
  input: ChangeEmployeeGoalStatusInput,
  requestId: string,
): Promise<EmployeeGoalDocument> {
  return changeEmployeeGoalStatus(
    context,
    employeeGoalId,
    input,
    "ACTIVE",
    requestId,
  );
}
