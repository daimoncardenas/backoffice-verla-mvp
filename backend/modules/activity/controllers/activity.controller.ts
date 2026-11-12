import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  ActivityAccessError,
  ActivityConflictError,
  ActivityNotFoundError,
  ActivityValidationError,
} from "../services/activity.errors";
import {
  assertNoImmutableActivityFields,
  cancelActivity,
  createActivity,
  getActivity,
  listActivities,
  updateActivity,
} from "../services/activity.service";
import type {
  CancelActivityInput,
  CreateActivityInput,
  UpdateActivityInput,
} from "../types/activity.types";

type ActivityDocument = Awaited<ReturnType<typeof getActivity>>;

const SERVER_CONTROLLED_CREATE_FIELDS = [
  "organization_id",
  "partner_id",
  "assignment_id",
  "offer_snapshot",
  "status",
  "cancelled_at",
  "cancelled_by",
  "cancellation_reason",
  "creation_request_hash",
  "created_by",
  "updated_by",
] as const;

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ActivityValidationError("Invalid request body");
  }

  return body as Record<string, unknown>;
}

function assertNoFields(
  record: Record<string, unknown>,
  fields: readonly string[],
): void {
  for (const field of fields) {
    if (field in record) {
      throw new ActivityValidationError(`${field} is controlled by the server`);
    }
  }
}

function parseObjectId(value: unknown, field: string): Types.ObjectId {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new ActivityValidationError(`${field} is invalid`);
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
    throw new ActivityValidationError(`${field} is required`);
  }

  return value.trim();
}

function parseNullableText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ActivityValidationError(`${field} must be a string or null`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ActivityValidationError(`${field} is invalid`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ActivityValidationError(`${field} is invalid`);
  }

  return date;
}

export function parseCreateInput(body: unknown): CreateActivityInput {
  const record = asRecord(body);
  assertNoFields(record, SERVER_CONTROLLED_CREATE_FIELDS);

  return {
    employee_id:
      record.employee_id === undefined || record.employee_id === null
        ? undefined
        : parseObjectId(record.employee_id, "employee_id"),
    activity_type_id: parseObjectId(
      record.activity_type_id,
      "activity_type_id",
    ),
    city_id: parseObjectId(record.city_id, "city_id"),
    offer_id: parseNullableObjectId(record.offer_id, "offer_id"),
    title: parseRequiredString(record.title, "title"),
    description: parseNullableText(record.description, "description"),
    performed_at: parseDate(record.performed_at, "performed_at"),
    idempotency_key: parseRequiredString(
      record.idempotency_key,
      "idempotency_key",
    ),
  };
}

export function parseUpdateInput(body: unknown): UpdateActivityInput {
  const record = asRecord(body);

  assertNoImmutableActivityFields(record);

  if (
    typeof record.expectedVersion !== "number" ||
    !Number.isInteger(record.expectedVersion) ||
    record.expectedVersion < 0
  ) {
    throw new ActivityValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const input: UpdateActivityInput = {
    expectedVersion: record.expectedVersion,
  };

  if ("title" in record) {
    input.title = parseRequiredString(record.title, "title");
  }
  if ("description" in record) {
    input.description = parseNullableText(
      record.description,
      "description",
    );
  }
  if ("city_id" in record) {
    input.city_id = parseObjectId(record.city_id, "city_id");
  }
  if ("offer_id" in record) {
    input.offer_id = parseNullableObjectId(record.offer_id, "offer_id");
  }
  if ("performed_at" in record) {
    input.performed_at = parseDate(record.performed_at, "performed_at");
  }

  return input;
}

export function parseCancelInput(body: unknown): CancelActivityInput {
  const record = asRecord(body);

  assertNoFields(record, [
    "status",
    "cancelled_at",
    "cancelled_by",
    "cancellation_reason",
  ]);

  if (
    typeof record.expectedVersion !== "number" ||
    !Number.isInteger(record.expectedVersion) ||
    record.expectedVersion < 0
  ) {
    throw new ActivityValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  return {
    expectedVersion: record.expectedVersion,
    reason: parseRequiredString(record.reason, "reason"),
  };
}

export function serializeActivity(activity: ActivityDocument) {
  return {
    id: activity._id.toString(),
    employee_id: activity.employee_id.toString(),
    activity_type_id: activity.activity_type_id.toString(),
    assignment_id: activity.assignment_id.toString(),
    city_id: activity.city_id.toString(),
    offer_id: activity.offer_id?.toString() ?? null,
    offer_snapshot: activity.offer_snapshot
      ? {
          title: activity.offer_snapshot.title,
          starts_at: activity.offer_snapshot.starts_at.toISOString(),
          ends_at: activity.offer_snapshot.ends_at.toISOString(),
        }
      : null,
    title: activity.title,
    description: activity.description,
    performed_at: activity.performed_at.toISOString(),
    status: activity.status,
    cancelled_at: activity.cancelled_at?.toISOString() ?? null,
    cancelled_by: activity.cancelled_by?.toString() ?? null,
    cancellation_reason: activity.cancellation_reason,
    version: activity.version,
    created_at: activity.created_at.toISOString(),
    updated_at: activity.updated_at.toISOString(),
  };
}

export async function handleList(context: AuthContext) {
  const activities = await listActivities(context);

  return { activities: activities.map(serializeActivity) };
}

export async function handleGet(
  context: AuthContext,
  activityId: string,
) {
  const activity = await getActivity(
    context,
    parseObjectId(activityId, "activity id"),
  );

  return { activity: serializeActivity(activity) };
}

export async function handleCreate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const result = await createActivity(
    context,
    parseCreateInput(body),
    requestId,
  );

  return {
    activity: serializeActivity(result.activity),
    created: result.created,
  };
}

export async function handleUpdate(
  context: AuthContext,
  activityId: string,
  body: unknown,
  requestId: string,
) {
  const activity = await updateActivity(
    context,
    parseObjectId(activityId, "activity id"),
    parseUpdateInput(body),
    requestId,
  );

  return { activity: serializeActivity(activity) };
}

export async function handleCancel(
  context: AuthContext,
  activityId: string,
  body: unknown,
  requestId: string,
) {
  const activity = await cancelActivity(
    context,
    parseObjectId(activityId, "activity id"),
    parseCancelInput(body),
    requestId,
  );

  return { activity: serializeActivity(activity) };
}

export function activityErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof ActivityAccessError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof ActivityValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof ActivityNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ActivityConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
