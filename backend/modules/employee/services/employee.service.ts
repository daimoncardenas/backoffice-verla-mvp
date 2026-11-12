import "server-only";

import mongoose, {
  Types,
  type ClientSession,
  type HydratedDocument,
} from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import {
  assertPermission,
  expandPermissionActions,
} from "../../authorization/services/permission.service";
import { hashPassword } from "../../auth/services/password.service";
import {
  recordHistoryChange,
  type AuditContext,
} from "../../history-change/services/history.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { CityModel } from "../../city/entities/city.entity";
import { EmployeeModel, type Employee } from "../entities/employee.entity";
import {
  EmployeeTypeModel,
  type EmployeeType,
} from "../../employee-type/entities/employee-type.entity";
import {
  type EmployeeAssignment,
} from "../../employee-assignment/entities/employee-assignment.entity";
import { PartnerModel } from "../../partner/entities/partner.entity";
import { PermissionModel } from "../../permission/entities/permission.entity";
import {
  type UserAccount,
} from "../../user-account/entities/user-account.entity";
import {
  closeAssignmentRecord,
  createAssignmentRecord,
  createEmployeeRecord,
  createUserAccountRecord,
  findCurrentAssignment,
  findEmployeeRecord,
  listEmployeeAssignments,
  listEmployeeRecords,
  updateEmployeeRecord,
} from "../repository/employee.repository";
import {
  EmployeeAccessError,
  EmployeeConflictError,
  EmployeeNotFoundError,
  EmployeePermissionNotAssignableError,
  EmployeeValidationError,
} from "./employee.errors";
import type {
  ChangeEmployeeStatusInput,
  ChangeSupervisorInput,
  CreateEmployeeInput,
  DeleteEmployeeInput,
  ListEmployeeFilters,
  UpdateEmployeeInput,
} from "../types/employee.types";

type EmployeeDocument = HydratedDocument<Employee>;
type AssignmentDocument = HydratedDocument<EmployeeAssignment>;
type EmployeeTypeDocument = HydratedDocument<EmployeeType>;
type UserAccountDocument = HydratedDocument<UserAccount>;

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

export function employeeScopeFilter(
  context: AuthContext,
): Record<string, unknown> {
  const base = {
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    deleted_at: null,
  };

  if (context.account_type === "PARTNER") {
    return base;
  }

  if (!context.employee_id) {
    return { ...base, _id: { $in: [] } };
  }

  return {
    ...base,
    $or: [
      { _id: context.employee_id },
      { supervisor_id: context.employee_id },
    ],
  };
}

function employeeSnapshot(
  employee: EmployeeDocument,
): Record<string, unknown> {
  return {
    employee_type_id: employee.employee_type_id.toString(),
    first_name: employee.first_name,
    last_name: employee.last_name,
    document_type: employee.document_type,
    document_number: employee.document_number,
    email: employee.email,
    phone: employee.phone,
    job_title: employee.job_title,
    hired_at: employee.hired_at,
    city_ids: employee.city_ids.map((id) => id.toString()),
    supervisor_id: employee.supervisor_id?.toString() ?? null,
    additional_permission:
      employee.additional_permission?.map((id) => id.toString()) ?? null,
    status: employee.status,
    status_reason: employee.status_reason,
    status_changed_at: employee.status_changed_at,
    status_changed_by: employee.status_changed_by?.toString() ?? null,
  };
}

function assignmentSnapshot(
  assignment: AssignmentDocument,
): Record<string, unknown> {
  return {
    employee_id: assignment.employee_id.toString(),
    employee_type_id: assignment.employee_type_id.toString(),
    supervisor_id: assignment.supervisor_id?.toString() ?? null,
    valid_from: assignment.valid_from,
    valid_to: assignment.valid_to,
  };
}

function userAccountSnapshot(
  account: UserAccountDocument,
): Record<string, unknown> {
  return {
    partner_id: account.partner_id?.toString() ?? null,
    employee_id: account.employee_id?.toString() ?? null,
    account_type: account.account_type,
    display_name: account.display_name,
    email: account.email,
    status: account.status,
    token_version: account.token_version,
    theme: account.theme,
    is_service: account.is_service,
  };
}

function buildEmployeeAuditDiff(
  current: EmployeeDocument,
  changes: Record<string, unknown>,
): {
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
} {
  const snapshot = employeeSnapshot(current);
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const key of Object.keys(changes)) {
    previousValues[key] = snapshot[key];
    const value = changes[key];

    newValues[key] =
      value instanceof Types.ObjectId
        ? value.toString()
        : Array.isArray(value)
          ? value.map((item) => item.toString())
          : value;
  }

  return { previous_values: previousValues, new_values: newValues };
}

function sameIds(
  currentIds: readonly Types.ObjectId[] | null | undefined,
  nextIds: readonly Types.ObjectId[] | null,
): boolean {
  const left = (currentIds ?? []).map((id) => id.toString()).sort().join(",");
  const right = (nextIds ?? []).map((id) => id.toString()).sort().join(",");
  return left === right;
}

function buildEmployeeChanges(
  current: EmployeeDocument,
  input: UpdateEmployeeInput,
  newSupervisorId: Types.ObjectId | null,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};

  if (input.first_name !== undefined && input.first_name !== current.first_name) {
    changes.first_name = input.first_name;
  }
  if (input.last_name !== undefined && input.last_name !== current.last_name) {
    changes.last_name = input.last_name;
  }
  if (input.phone !== undefined && input.phone !== current.phone) {
    changes.phone = input.phone;
  }
  if (input.job_title !== undefined && input.job_title !== current.job_title) {
    changes.job_title = input.job_title;
  }
  if (
    input.city_ids !== undefined &&
    !sameIds(current.city_ids, input.city_ids)
  ) {
    changes.city_ids = input.city_ids;
  }
  if (input.additional_permission !== undefined) {
    const nextPermissions =
      input.additional_permission && input.additional_permission.length > 0
        ? input.additional_permission
        : null;
    if (!sameIds(current.additional_permission, nextPermissions)) {
      changes.additional_permission = nextPermissions;
    }
  }
  if (
    input.employee_type_id !== undefined &&
    !input.employee_type_id.equals(current.employee_type_id)
  ) {
    changes.employee_type_id = input.employee_type_id;
  }
  if (
    (newSupervisorId?.toString() ?? null) !==
    (current.supervisor_id?.toString() ?? null)
  ) {
    changes.supervisor_id = newSupervisorId;
  }

  return changes;
}

export function findUnassignablePermission(
  assignedCodes: readonly string[],
  enabledCodes: readonly string[],
): string | null {
  const enabled = expandPermissionActions(enabledCodes);

  for (const code of expandPermissionActions(assignedCodes)) {
    if (!enabled.has(code)) {
      return code;
    }
  }

  return null;
}

async function assertAdditionalPermissions(
  context: AuthContext,
  permissionIds: readonly Types.ObjectId[],
): Promise<void> {
  if (permissionIds.length === 0) {
    return;
  }

  const uniqueIds = new Set(permissionIds.map((id) => id.toString()));

  if (uniqueIds.size !== permissionIds.length) {
    throw new EmployeeValidationError(
      "additional_permission must not contain duplicates",
    );
  }

  const partner = await PartnerModel.findOne({
    _id: context.partner_id,
    organization_id: context.organization_id,
  });

  if (!partner) {
    throw new EmployeeValidationError("Partner not found");
  }

  const [assignedPermissions, enabledPermissions] = await Promise.all([
    PermissionModel.find({
      _id: { $in: permissionIds },
      organization_id: context.organization_id,
      is_active: true,
    })
      .select("code")
      .lean(),
    PermissionModel.find({
      _id: { $in: partner.enabled_permission_ids },
      organization_id: context.organization_id,
      is_active: true,
    })
      .select("code")
      .lean(),
  ]);

  if (assignedPermissions.length !== uniqueIds.size) {
    throw new EmployeeValidationError(
      "One or more permissions do not exist or are inactive",
    );
  }

  const unassignable = findUnassignablePermission(
    assignedPermissions.map((permission) => permission.code),
    enabledPermissions.map((permission) => permission.code),
  );

  if (unassignable) {
    throw new EmployeePermissionNotAssignableError(unassignable);
  }
}

async function assertValidCities(
  context: AuthContext,
  cityIds: readonly Types.ObjectId[],
): Promise<void> {
  const uniqueIds = new Set(cityIds.map((id) => id.toString()));

  if (uniqueIds.size !== cityIds.length) {
    throw new EmployeeValidationError("city_ids must not contain duplicates");
  }

  if (uniqueIds.size === 0) {
    throw new EmployeeValidationError("At least one city is required");
  }

  const count = await CityModel.countDocuments({
    _id: { $in: [...uniqueIds].map((id) => new Types.ObjectId(id)) },
    organization_id: context.organization_id,
    is_active: true,
    deleted_at: null,
  });

  if (count !== uniqueIds.size) {
    throw new EmployeeValidationError(
      "One or more cities are invalid or inactive",
    );
  }
}

async function loadActiveEmployeeType(
  context: AuthContext,
  employeeTypeId: Types.ObjectId,
): Promise<EmployeeTypeDocument> {
  const employeeType = await EmployeeTypeModel.findOne({
    _id: employeeTypeId,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    is_active: true,
    deleted_at: null,
  });

  if (!employeeType) {
    throw new EmployeeValidationError(
      "Employee type not found or inactive",
    );
  }

  return employeeType;
}

async function assertCoordinator(
  context: AuthContext,
  supervisorId: Types.ObjectId,
): Promise<void> {
  const supervisor = await EmployeeModel.findOne({
    _id: supervisorId,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    deleted_at: null,
  });

  if (!supervisor || supervisor.status !== "ACTIVE") {
    throw new EmployeeValidationError(
      "Supervisor must be an active employee",
    );
  }

  const supervisorType = await EmployeeTypeModel.findOne({
    _id: supervisor.employee_type_id,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    is_active: true,
    deleted_at: null,
  });

  if (!supervisorType || supervisorType.code !== "COORDINATOR") {
    throw new EmployeeValidationError(
      "Supervisor must have the COORDINATOR role",
    );
  }
}

async function actorEmployeeType(
  context: AuthContext,
): Promise<EmployeeTypeDocument | null> {
  if (!context.employee_id) {
    return null;
  }

  const actor = await EmployeeModel.findOne({
    _id: context.employee_id,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    deleted_at: null,
  });

  if (!actor || actor.status !== "ACTIVE") {
    return null;
  }

  return EmployeeTypeModel.findOne({
    _id: actor.employee_type_id,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    is_active: true,
    deleted_at: null,
  });
}

function defaultEmployeePassword(): string {
  return process.env.DEFAULT_EMPLOYEE_PASSWORD ?? "1234567";
}

export function resolveSupervisorForCreation(input: {
  actorAccountType: "PARTNER" | "EMPLOYEE";
  actorEmployeeId: Types.ObjectId | null;
  actorTypeCode: string | null;
  targetTypeCode: string;
  requestedSupervisorId: Types.ObjectId | null;
}): Types.ObjectId | null {
  if (input.actorAccountType === "EMPLOYEE") {
    if (!input.actorEmployeeId) {
      throw new EmployeeAccessError(
        "Employee context is missing an employee id",
      );
    }

    if (input.actorTypeCode !== "COORDINATOR") {
      throw new EmployeeAccessError(
        "Only coordinators can create employees",
      );
    }

    if (input.targetTypeCode !== "SELLER") {
      throw new EmployeeAccessError(
        "Coordinators can only create SELLER employees",
      );
    }

    if (
      input.requestedSupervisorId &&
      !input.requestedSupervisorId.equals(input.actorEmployeeId)
    ) {
      throw new EmployeeValidationError(
        "Coordinator must be the supervisor",
      );
    }

    return input.actorEmployeeId;
  }

  if (input.targetTypeCode === "COORDINATOR") {
    if (input.requestedSupervisorId) {
      throw new EmployeeValidationError(
        "COORDINATOR employees cannot have a supervisor",
      );
    }

    return null;
  }

  if (input.targetTypeCode === "SELLER" && !input.requestedSupervisorId) {
    throw new EmployeeValidationError("SELLER requires a supervisor");
  }

  return input.requestedSupervisorId;
}

export function requiresPermissionAssignForCreation(
  additionalPermission: readonly Types.ObjectId[] | null | undefined,
): boolean {
  return (additionalPermission?.length ?? 0) > 0;
}

export function resolveSupervisorForRoleChange(input: {
  currentSupervisorId: Types.ObjectId | null;
  requestedSupervisorId: Types.ObjectId | null | undefined;
  targetTypeCode: string;
}): Types.ObjectId | null {
  if (input.targetTypeCode === "COORDINATOR") {
    if (input.requestedSupervisorId) {
      throw new EmployeeValidationError(
        "COORDINATOR employees cannot have a supervisor",
      );
    }

    return null;
  }

  if (input.targetTypeCode === "SELLER") {
    const supervisorId =
      input.requestedSupervisorId === undefined
        ? input.currentSupervisorId
        : input.requestedSupervisorId;

    if (!supervisorId) {
      throw new EmployeeValidationError("SELLER requires a supervisor");
    }

    return supervisorId;
  }

  return input.requestedSupervisorId === undefined
    ? input.currentSupervisorId
    : input.requestedSupervisorId;
}

export function assertAssignmentCanCloseAt(
  assignment: { valid_from: Date },
  changeAt: Date,
): void {
  if (changeAt.getTime() <= assignment.valid_from.getTime()) {
    throw new EmployeeValidationError(
      "Assignment change time must be after valid_from",
    );
  }
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

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function loadScopedEmployee(
  context: AuthContext,
  employeeId: Types.ObjectId,
): Promise<EmployeeDocument> {
  const employee = await findEmployeeRecord({
    ...employeeScopeFilter(context),
    _id: employeeId,
  });

  if (!employee) {
    throw new EmployeeNotFoundError();
  }

  return employee;
}

export async function listEmployees(
  context: AuthContext,
  filters: ListEmployeeFilters,
): Promise<EmployeeDocument[]> {
  await assertPermission(context, "EMPLOYEE_LIST");

  if (context.account_type === "ORGANIZATION") {
    await connectToDatabase();

    const filter: Record<string, unknown> = {
      organization_id: context.organization_id,
      deleted_at: null,
    };

    if (filters.employee_type_id) {
      filter.employee_type_id = filters.employee_type_id;
    }
    if (filters.city_id) {
      filter.city_ids = filters.city_id;
    }
    if (filters.status) {
      filter.status = filters.status;
    }

    return EmployeeModel.find(filter).sort({ created_at: -1 });
  }

  const filter: Record<string, unknown> = {
    ...employeeScopeFilter(context),
  };

  if (filters.employee_type_id) {
    filter.employee_type_id = filters.employee_type_id;
  }
  if (filters.city_id) {
    filter.city_ids = filters.city_id;
  }
  if (filters.status) {
    filter.status = filters.status;
  }

  return listEmployeeRecords(filter);
}

export async function getEmployee(
  context: AuthContext,
  employeeId: Types.ObjectId,
): Promise<{
  employee: EmployeeDocument;
  current_assignment: AssignmentDocument | null;
}> {
  await assertPermission(context, "EMPLOYEE_READ");

  const employee = await loadScopedEmployee(context, employeeId);
  const currentAssignment = await findCurrentAssignment(
    employeeId,
    context.organization_id,
    context.partner_id,
  );

  return {
    employee,
    current_assignment: currentAssignment,
  };
}

export async function createEmployee(
  context: AuthContext,
  input: CreateEmployeeInput,
  requestId: string,
): Promise<EmployeeDocument> {
  await assertPermission(context, "EMPLOYEE_CREATE");

  if (
    input.additional_permission !== undefined &&
    context.account_type !== "ORGANIZATION"
  ) {
    throw new EmployeeAccessError(
      "Solo la organización puede asignar permisos adicionales",
    );
  }

  const employeeType = await loadActiveEmployeeType(
    context,
    input.employee_type_id,
  );

  let supervisorId = input.supervisor_id;

  if (context.account_type === "EMPLOYEE") {
    if (!context.employee_id) {
      throw new EmployeeAccessError(
        "Employee context is missing an employee id",
      );
    }

    const currentType = await actorEmployeeType(context);

    supervisorId = resolveSupervisorForCreation({
      actorAccountType: "EMPLOYEE",
      actorEmployeeId: context.employee_id,
      actorTypeCode: currentType?.code ?? null,
      targetTypeCode: employeeType.code,
      requestedSupervisorId: input.supervisor_id,
    });
  } else {
    supervisorId = resolveSupervisorForCreation({
      actorAccountType: "PARTNER",
      actorEmployeeId: null,
      actorTypeCode: null,
      targetTypeCode: employeeType.code,
      requestedSupervisorId: input.supervisor_id,
    });

    if (supervisorId) {
      await assertCoordinator(context, supervisorId);
    }
  }

  await assertValidCities(context, input.city_ids);

  if (requiresPermissionAssignForCreation(input.additional_permission)) {
    await assertPermission(context, "PERMISSION_ASSIGN");
    await assertAdditionalPermissions(
      context,
      input.additional_permission ?? [],
    );
  }

  const passwordHash = await hashPassword(defaultEmployeePassword());
  const email = input.email.trim().toLowerCase();
  const displayName = `${input.first_name.trim()} ${input.last_name.trim()}`.trim();
  const additionalPermission =
    input.additional_permission && input.additional_permission.length > 0
      ? input.additional_permission
      : null;
  const auditContext = buildAuditContext(context, requestId);

  try {
    return await withTransaction(async (session) => {
      const employee = await createEmployeeRecord(
        {
          organization_id: context.organization_id,
          partner_id: context.partner_id,
          employee_type_id: employeeType._id,
          first_name: input.first_name,
          last_name: input.last_name,
          document_type: input.document_type,
          document_number: input.document_number,
          email,
          phone: input.phone,
          job_title: input.job_title,
          hired_at: input.hired_at,
          city_ids: input.city_ids,
          supervisor_id: supervisorId,
          additional_permission: additionalPermission,
          status: "ACTIVE",
          created_by: context.account_id,
          updated_by: context.account_id,
          version: 0,
        },
        session,
      );

      const assignment = await createAssignmentRecord(
        {
          organization_id: context.organization_id,
          partner_id: context.partner_id,
          employee_id: employee._id,
          employee_type_id: employeeType._id,
          supervisor_id: supervisorId,
          valid_from: input.hired_at,
          valid_to: null,
          created_by: context.account_id,
          updated_by: context.account_id,
          version: 0,
        },
        session,
      );

      const account = await createUserAccountRecord(
        {
          organization_id: context.organization_id,
          partner_id: context.partner_id,
          employee_id: employee._id,
          account_type: "EMPLOYEE",
          display_name: displayName,
          email,
          password_hash: passwordHash,
          status: "ACTIVE",
          token_version: 0,
          theme: "SYSTEM",
          is_service: false,
          created_by: context.account_id,
          updated_by: context.account_id,
          version: 0,
        },
        session,
      );

      await recordHistoryChange(session, auditContext, {
        entity_name: "employee",
        record_id: employee._id,
        action: "CREATE",
        previous_values: null,
        new_values: employeeSnapshot(employee),
      });

      await recordHistoryChange(session, auditContext, {
        entity_name: "employee_assignment",
        record_id: assignment._id,
        action: "CREATE",
        previous_values: null,
        new_values: assignmentSnapshot(assignment),
      });

      await recordHistoryChange(session, auditContext, {
        entity_name: "user_account",
        record_id: account._id,
        action: "CREATE",
        previous_values: null,
        new_values: userAccountSnapshot(account),
      });

      return employee;
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new EmployeeConflictError(
        "Employee document or access email already exists",
      );
    }
    throw error;
  }
}

export async function updateEmployee(
  context: AuthContext,
  employeeId: Types.ObjectId,
  input: UpdateEmployeeInput,
  requestId: string,
): Promise<EmployeeDocument> {
  await assertPermission(context, "EMPLOYEE_UPDATE");

  if (
    input.additional_permission !== undefined &&
    context.account_type !== "ORGANIZATION"
  ) {
    throw new EmployeeAccessError(
      "Solo la organización puede asignar permisos adicionales",
    );
  }

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new EmployeeValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const current = await loadScopedEmployee(context, employeeId);

  if (current.version !== input.expectedVersion) {
    throw new EmployeeConflictError("Version conflict");
  }

  const roleChanged =
    input.employee_type_id !== undefined &&
    !input.employee_type_id.equals(current.employee_type_id);

  if (input.supervisor_id !== undefined && !roleChanged) {
    throw new EmployeeValidationError(
      "supervisor_id is only allowed together with a role change",
    );
  }

  let newEmployeeType: EmployeeTypeDocument | null = null;
  let newSupervisorId = current.supervisor_id;

  if (roleChanged && input.employee_type_id) {
    if (context.account_type === "EMPLOYEE") {
      throw new EmployeeAccessError(
        "Only the partner can change employee roles",
      );
    }

    newEmployeeType = await loadActiveEmployeeType(
      context,
      input.employee_type_id,
    );

    if (
      input.supervisor_id !== undefined &&
      newEmployeeType.code !== "SELLER"
    ) {
      throw new EmployeeValidationError(
        "supervisor_id is only allowed when changing to SELLER",
      );
    }

    if (input.supervisor_id !== undefined) {
      await assertPermission(context, "EMPLOYEE_ASSIGN_COORDINATOR");
    }

    newSupervisorId = resolveSupervisorForRoleChange({
      currentSupervisorId: current.supervisor_id,
      requestedSupervisorId: input.supervisor_id,
      targetTypeCode: newEmployeeType.code,
    });

    if (newSupervisorId) {
      if (newSupervisorId.equals(employeeId)) {
        throw new EmployeeValidationError(
          "Employee cannot be their own supervisor",
        );
      }

      await assertCoordinator(context, newSupervisorId);
    }
  }

  if (input.city_ids !== undefined) {
    await assertValidCities(context, input.city_ids);
  }

  if (input.additional_permission !== undefined) {
    await assertPermission(context, "PERMISSION_ASSIGN");

    if (input.additional_permission) {
      await assertAdditionalPermissions(context, input.additional_permission);
    }
  }

  const changes = buildEmployeeChanges(current, input, newSupervisorId);

  if (Object.keys(changes).length === 0) {
    return current;
  }

  const auditDiff = buildEmployeeAuditDiff(current, changes);
  const auditContext = buildAuditContext(context, requestId);
  const currentAssignment = roleChanged
    ? await findCurrentAssignment(
        employeeId,
        context.organization_id,
        context.partner_id,
      )
    : null;

  if (roleChanged && !currentAssignment) {
    throw new EmployeeConflictError("Current assignment not found");
  }

  const changeAt = new Date();

  if (roleChanged && currentAssignment) {
    assertAssignmentCanCloseAt(currentAssignment, changeAt);
  }

  try {
    return await withTransaction(async (session) => {
      if (roleChanged && currentAssignment) {
        const closed = await closeAssignmentRecord(
          currentAssignment._id,
          changeAt,
          context.account_id,
          session,
        );

        if (!closed) {
          throw new EmployeeConflictError(
            "Current assignment changed",
          );
        }

        await recordHistoryChange(session, auditContext, {
          entity_name: "employee_assignment",
          record_id: closed._id,
          action: "UPDATE",
          previous_values: { valid_to: null },
          new_values: { valid_to: closed.valid_to },
        });

        const assignment = await createAssignmentRecord(
          {
            organization_id: context.organization_id,
            partner_id: context.partner_id,
            employee_id: employeeId,
            employee_type_id: newEmployeeType!._id,
            supervisor_id: newSupervisorId,
            valid_from: changeAt,
            valid_to: null,
            created_by: context.account_id,
            updated_by: context.account_id,
            version: 0,
          },
          session,
        );

        await recordHistoryChange(session, auditContext, {
          entity_name: "employee_assignment",
          record_id: assignment._id,
          action: "CREATE",
          previous_values: null,
          new_values: assignmentSnapshot(assignment),
        });
      }

      const updated = await updateEmployeeRecord(
        {
          _id: employeeId,
          organization_id: context.organization_id,
          partner_id: context.partner_id,
          version: input.expectedVersion,
          deleted_at: null,
        },
        {
          ...changes,
          updated_by: context.account_id,
        },
        session,
      );

      if (!updated) {
        throw new EmployeeConflictError("Version conflict");
      }

      await recordHistoryChange(session, auditContext, {
        entity_name: "employee",
        record_id: updated._id,
        action: "UPDATE",
        previous_values: auditDiff.previous_values,
        new_values: auditDiff.new_values,
      });

      return updated;
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new EmployeeConflictError(
        "Employee document or access email already exists",
      );
    }
    throw error;
  }
}

export async function changeSupervisor(
  context: AuthContext,
  employeeId: Types.ObjectId,
  input: ChangeSupervisorInput,
  requestId: string,
): Promise<EmployeeDocument> {
  await assertPermission(context, "EMPLOYEE_ASSIGN_COORDINATOR");

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new EmployeeValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const current = await loadScopedEmployee(context, employeeId);

  if (current.version !== input.expectedVersion) {
    throw new EmployeeConflictError("Version conflict");
  }

  if (current.supervisor_id?.equals(input.supervisor_id)) {
    return current;
  }

  const employeeType = await loadActiveEmployeeType(
    context,
    current.employee_type_id,
  );

  if (employeeType.code !== "SELLER") {
    throw new EmployeeValidationError(
      "Only SELLER employees can have a supervisor changed",
    );
  }

  await assertCoordinator(context, input.supervisor_id);

  const currentAssignment = await findCurrentAssignment(
    employeeId,
    context.organization_id,
    context.partner_id,
  );

  if (!currentAssignment) {
    throw new EmployeeConflictError("Current assignment not found");
  }

  const auditContext = buildAuditContext(context, requestId);
  const changeAt = new Date();
  assertAssignmentCanCloseAt(currentAssignment, changeAt);

  return withTransaction(async (session) => {
    const closed = await closeAssignmentRecord(
      currentAssignment._id,
      changeAt,
      context.account_id,
      session,
    );

    if (!closed) {
      throw new EmployeeConflictError("Current assignment changed");
    }

    await recordHistoryChange(session, auditContext, {
      entity_name: "employee_assignment",
      record_id: closed._id,
      action: "UPDATE",
      previous_values: { valid_to: null },
      new_values: { valid_to: closed.valid_to },
    });

    const assignment = await createAssignmentRecord(
      {
        organization_id: context.organization_id,
        partner_id: context.partner_id,
        employee_id: employeeId,
        employee_type_id: current.employee_type_id,
        supervisor_id: input.supervisor_id,
        valid_from: changeAt,
        valid_to: null,
        created_by: context.account_id,
        updated_by: context.account_id,
        version: 0,
      },
      session,
    );

    await recordHistoryChange(session, auditContext, {
      entity_name: "employee_assignment",
      record_id: assignment._id,
      action: "CREATE",
      previous_values: null,
      new_values: assignmentSnapshot(assignment),
    });

    const updated = await updateEmployeeRecord(
      {
        _id: employeeId,
        organization_id: context.organization_id,
        partner_id: context.partner_id,
        version: input.expectedVersion,
        deleted_at: null,
      },
      {
        supervisor_id: input.supervisor_id,
        updated_by: context.account_id,
      },
      session,
    );

    if (!updated) {
      throw new EmployeeConflictError("Version conflict");
    }

    await recordHistoryChange(session, auditContext, {
      entity_name: "employee",
      record_id: updated._id,
      action: "UPDATE",
      previous_values: {
        supervisor_id: current.supervisor_id?.toString() ?? null,
      },
      new_values: {
        supervisor_id: input.supervisor_id.toString(),
      },
    });

    return updated;
  });
}

export async function listAssignments(
  context: AuthContext,
  employeeId: Types.ObjectId,
): Promise<AssignmentDocument[]> {
  await assertPermission(context, "EMPLOYEE_READ");
  await loadScopedEmployee(context, employeeId);

  return listEmployeeAssignments(
    employeeId,
    context.organization_id,
    context.partner_id,
  );
}

export function normalizeStatusReason(
  status: "ACTIVE" | "INACTIVE" | "BLOCKED",
  reason: string | null | undefined,
): string | null {
  if (status === "ACTIVE") {
    return null;
  }

  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new EmployeeValidationError(
      "status_reason is required for INACTIVE or BLOCKED",
    );
  }

  return reason.trim();
}

export async function changeEmployeeStatus(
  context: AuthContext,
  employeeId: Types.ObjectId,
  input: ChangeEmployeeStatusInput,
  requestId: string,
): Promise<EmployeeDocument> {
  await assertPermission(context, "EMPLOYEE_STATUS_UPDATE");

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new EmployeeValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const current = await loadScopedEmployee(context, employeeId);

  if (current.version !== input.expectedVersion) {
    throw new EmployeeConflictError("Version conflict");
  }

  const statusReason = normalizeStatusReason(
    input.status,
    input.status_reason,
  );

  if (current.status === input.status) {
    return current;
  }

  const statusChangedAt = new Date();
  const businessChanges = {
    status: input.status,
    status_reason: statusReason,
    status_changed_at: statusChangedAt,
    status_changed_by: context.account_id,
  };
  const auditDiff = buildEmployeeAuditDiff(current, businessChanges);
  const auditContext = buildAuditContext(context, requestId);

  return withTransaction(async (session) => {
    const updated = await updateEmployeeRecord(
      {
        _id: employeeId,
        organization_id: context.organization_id,
        partner_id: context.partner_id,
        version: input.expectedVersion,
        deleted_at: null,
      },
      {
        ...businessChanges,
        updated_by: context.account_id,
      },
      session,
    );

    if (!updated) {
      throw new EmployeeConflictError("Version conflict");
    }

    await recordHistoryChange(session, auditContext, {
      entity_name: "employee",
      record_id: updated._id,
      action: "UPDATE",
      previous_values: auditDiff.previous_values,
      new_values: auditDiff.new_values,
    });

    return updated;
  });
}

export async function deleteEmployee(
  context: AuthContext,
  employeeId: Types.ObjectId,
  input: DeleteEmployeeInput,
  requestId: string,
): Promise<void> {
  await assertPermission(context, "EMPLOYEE_DELETE");

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new EmployeeValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const current = await loadScopedEmployee(context, employeeId);

  if (current.version !== input.expectedVersion) {
    throw new EmployeeConflictError("Version conflict");
  }

  const deletedAt = new Date();
  const auditContext = buildAuditContext(context, requestId);

  await withTransaction(async (session) => {
    const deleted = await updateEmployeeRecord(
      {
        _id: employeeId,
        organization_id: context.organization_id,
        partner_id: context.partner_id,
        version: input.expectedVersion,
        deleted_at: null,
      },
      {
        deleted_at: deletedAt,
        deleted_by: context.account_id,
        updated_by: context.account_id,
      },
      session,
    );

    if (!deleted) {
      throw new EmployeeConflictError("Version conflict");
    }

    await recordHistoryChange(session, auditContext, {
      entity_name: "employee",
      record_id: deleted._id,
      action: "DELETE",
      previous_values: employeeSnapshot(current),
      new_values: null,
    });
  });
}
