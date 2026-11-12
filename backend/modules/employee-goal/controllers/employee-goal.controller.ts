import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  EmployeeGoalAccessError,
  EmployeeGoalConflictError,
  EmployeeGoalNotFoundError,
  EmployeeGoalValidationError,
} from "../services/employee-goal.errors";
import {
  cancelEmployeeGoal,
  createEmployeeGoal,
  getEmployeeGoal,
  listEmployeeGoals,
  reactivateEmployeeGoal,
} from "../services/employee-goal.service";
import type {
  ChangeEmployeeGoalStatusInput,
  CreateEmployeeGoalInput,
} from "../types/employee-goal.types";

type EmployeeGoalDocument = Awaited<ReturnType<typeof getEmployeeGoal>>;

const SERVER_CONTROLLED_FIELDS = [
  "organization_id",
  "partner_id",
  "timezone",
  "period_start",
  "period_end",
  "status",
  "rules_snapshot",
  "created_by",
  "updated_by",
  "version",
] as const;

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new EmployeeGoalValidationError("Invalid request body");
  }

  return body as Record<string, unknown>;
}

function assertNoServerFields(record: Record<string, unknown>): void {
  for (const field of SERVER_CONTROLLED_FIELDS) {
    if (field in record) {
      throw new EmployeeGoalValidationError(
        `${field} is controlled by the server`,
      );
    }
  }
}

function parseObjectId(value: unknown, field: string): Types.ObjectId {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new EmployeeGoalValidationError(`${field} is invalid`);
  }

  return new Types.ObjectId(value);
}

function parseInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new EmployeeGoalValidationError(`${field} must be an integer`);
  }

  return value;
}

function parseExpectedVersion(record: Record<string, unknown>): number {
  if (
    typeof record.expectedVersion !== "number" ||
    !Number.isInteger(record.expectedVersion) ||
    record.expectedVersion < 0
  ) {
    throw new EmployeeGoalValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  return record.expectedVersion;
}

export function parseCreateInput(body: unknown): CreateEmployeeGoalInput {
  const record = asRecord(body);
  assertNoServerFields(record);

  return {
    employee_id:
      record.employee_id === undefined || record.employee_id === null
        ? undefined
        : parseObjectId(record.employee_id, "employee_id"),
    goal_id: parseObjectId(record.goal_id, "goal_id"),
    year: parseInteger(record.year, "year"),
    month: parseInteger(record.month, "month"),
    target_value: parseInteger(record.target_value, "target_value"),
  };
}

export function parseStatusInput(
  body: unknown,
): ChangeEmployeeGoalStatusInput {
  const record = asRecord(body);

  for (const field of ["status", "reason"] as const) {
    if (field in record) {
      throw new EmployeeGoalValidationError(
        `${field} is not accepted by this operation`,
      );
    }
  }

  return { expectedVersion: parseExpectedVersion(record) };
}

export function serializeEmployeeGoal(employeeGoal: EmployeeGoalDocument) {
  return {
    id: employeeGoal._id.toString(),
    employee_id: employeeGoal.employee_id.toString(),
    goal_id: employeeGoal.goal_id.toString(),
    year: employeeGoal.year,
    month: employeeGoal.month,
    timezone: employeeGoal.timezone,
    period_start: employeeGoal.period_start.toISOString(),
    period_end: employeeGoal.period_end.toISOString(),
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
    version: employeeGoal.version,
    created_at: employeeGoal.created_at.toISOString(),
    updated_at: employeeGoal.updated_at.toISOString(),
  };
}

export async function handleList(context: AuthContext) {
  const employeeGoals = await listEmployeeGoals(context);

  return { employee_goals: employeeGoals.map(serializeEmployeeGoal) };
}

export async function handleGet(
  context: AuthContext,
  employeeGoalId: string,
) {
  const employeeGoal = await getEmployeeGoal(
    context,
    parseObjectId(employeeGoalId, "employee goal id"),
  );

  return { employee_goal: serializeEmployeeGoal(employeeGoal) };
}

export async function handleCreate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const employeeGoal = await createEmployeeGoal(
    context,
    parseCreateInput(body),
    requestId,
  );

  return { employee_goal: serializeEmployeeGoal(employeeGoal) };
}

export async function handleCancel(
  context: AuthContext,
  employeeGoalId: string,
  body: unknown,
  requestId: string,
) {
  const employeeGoal = await cancelEmployeeGoal(
    context,
    parseObjectId(employeeGoalId, "employee goal id"),
    parseStatusInput(body),
    requestId,
  );

  return { employee_goal: serializeEmployeeGoal(employeeGoal) };
}

export async function handleReactivate(
  context: AuthContext,
  employeeGoalId: string,
  body: unknown,
  requestId: string,
) {
  const employeeGoal = await reactivateEmployeeGoal(
    context,
    parseObjectId(employeeGoalId, "employee goal id"),
    parseStatusInput(body),
    requestId,
  );

  return { employee_goal: serializeEmployeeGoal(employeeGoal) };
}

export function employeeGoalErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof EmployeeGoalAccessError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof EmployeeGoalValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof EmployeeGoalNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof EmployeeGoalConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
