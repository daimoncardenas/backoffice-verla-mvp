import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  GoalConflictError,
  GoalNotFoundError,
  GoalValidationError,
} from "../services/goal.errors";
import {
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  updateGoal,
} from "../services/goal.service";
import type { CreateGoalInput, UpdateGoalInput } from "../types/goal.types";

type GoalDocument = Awaited<ReturnType<typeof getGoal>>;

const SERVER_CONTROLLED_FIELDS = [
  "organization_id",
  "partner_id",
  "aggregation",
  "required_activity_status",
  "deleted_at",
  "deleted_by",
  "created_by",
  "updated_by",
  "version",
] as const;

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new GoalValidationError("Invalid request body");
  }

  return body as Record<string, unknown>;
}

function assertNoServerFields(record: Record<string, unknown>): void {
  for (const field of SERVER_CONTROLLED_FIELDS) {
    if (field in record) {
      throw new GoalValidationError(`${field} is controlled by the server`);
    }
  }
}

function parseObjectId(value: unknown, field: string): Types.ObjectId {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new GoalValidationError(`${field} is invalid`);
  }

  return new Types.ObjectId(value);
}

function parseNullableObjectId(
  value: unknown,
  field: string,
): Types.ObjectId | null {
  if (value === undefined || value === null) {
    return null;
  }

  return parseObjectId(value, field);
}

function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new GoalValidationError(`${field} is required`);
  }

  return value.trim();
}

function parseNullableText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new GoalValidationError(`${field} must be a string or null`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseExpectedVersion(record: Record<string, unknown>): number {
  if (
    typeof record.expectedVersion !== "number" ||
    !Number.isInteger(record.expectedVersion) ||
    record.expectedVersion < 0
  ) {
    throw new GoalValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  return record.expectedVersion;
}

export function parseCreateInput(body: unknown): CreateGoalInput {
  const record = asRecord(body);
  assertNoServerFields(record);

  return {
    code: parseRequiredString(record.code, "code"),
    name: parseRequiredString(record.name, "name"),
    description: parseNullableText(record.description, "description"),
    activity_type_id: parseObjectId(
      record.activity_type_id,
      "activity_type_id",
    ),
    offer_id: parseNullableObjectId(record.offer_id, "offer_id"),
  };
}

export function parseUpdateInput(body: unknown): UpdateGoalInput {
  const record = asRecord(body);
  assertNoServerFields(record);

  const input: UpdateGoalInput = {
    expectedVersion: parseExpectedVersion(record),
  };

  if ("code" in record) {
    input.code = parseRequiredString(record.code, "code");
  }
  if ("name" in record) {
    input.name = parseRequiredString(record.name, "name");
  }
  if ("description" in record) {
    input.description = parseNullableText(
      record.description,
      "description",
    );
  }
  if ("activity_type_id" in record) {
    input.activity_type_id = parseObjectId(
      record.activity_type_id,
      "activity_type_id",
    );
  }
  if ("offer_id" in record) {
    input.offer_id = parseNullableObjectId(record.offer_id, "offer_id");
  }
  if ("is_active" in record) {
    if (typeof record.is_active !== "boolean") {
      throw new GoalValidationError("is_active must be a boolean");
    }
    input.is_active = record.is_active;
  }

  return input;
}

export function parseDeleteInput(body: unknown) {
  const record = asRecord(body);
  return { expectedVersion: parseExpectedVersion(record) };
}

export function serializeGoal(goal: GoalDocument) {
  return {
    id: goal._id.toString(),
    partner_id: goal.partner_id.toString(),
    code: goal.code,
    name: goal.name,
    description: goal.description,
    activity_type_id: goal.activity_type_id.toString(),
    aggregation: goal.aggregation,
    required_activity_status: goal.required_activity_status,
    offer_id: goal.offer_id?.toString() ?? null,
    is_active: goal.is_active,
    version: goal.version,
    created_at: goal.created_at.toISOString(),
    updated_at: goal.updated_at.toISOString(),
  };
}

export async function handleList(context: AuthContext) {
  const goals = await listGoals(context);

  return { goals: goals.map(serializeGoal) };
}

export async function handleGet(context: AuthContext, goalId: string) {
  const goal = await getGoal(
    context,
    parseObjectId(goalId, "goal id"),
  );

  return { goal: serializeGoal(goal) };
}

export async function handleCreate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const goal = await createGoal(
    context,
    parseCreateInput(body),
    requestId,
  );

  return { goal: serializeGoal(goal) };
}

export async function handleUpdate(
  context: AuthContext,
  goalId: string,
  body: unknown,
  requestId: string,
) {
  const goal = await updateGoal(
    context,
    parseObjectId(goalId, "goal id"),
    parseUpdateInput(body),
    requestId,
  );

  return { goal: serializeGoal(goal) };
}

export async function handleDelete(
  context: AuthContext,
  goalId: string,
  body: unknown,
  requestId: string,
) {
  await deleteGoal(
    context,
    parseObjectId(goalId, "goal id"),
    parseDeleteInput(body).expectedVersion,
    requestId,
  );
}

export function goalErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof GoalValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof GoalNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof GoalConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
