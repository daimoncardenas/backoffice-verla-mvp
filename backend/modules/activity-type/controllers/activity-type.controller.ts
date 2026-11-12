import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  ActivityTypeConflictError,
  ActivityTypeValidationError,
  createActivityType,
  listActiveActivityTypes,
} from "../services/activity-type.service";

type ActivityTypeDocument = Awaited<
  ReturnType<typeof listActiveActivityTypes>
>[number];

function serializeActivityType(activityType: ActivityTypeDocument) {
  return {
    id: activityType._id.toString(),
    code: activityType.code,
    name: activityType.name,
    description: activityType.description,
    requires_offer: activityType.requires_offer,
    is_active: activityType.is_active,
  };
}

export async function handleList(context: AuthContext) {
  const activityTypes = await listActiveActivityTypes(context);

  return {
    activity_types: activityTypes.map(serializeActivityType),
  };
}

export function activityTypeErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof ActivityTypeValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof ActivityTypeConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ActivityTypeValidationError("Invalid request body");
  }
  return body as Record<string, unknown>;
}

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ActivityTypeValidationError(`${field} is required`);
  }
  return value.trim();
}

export async function handleCreate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const record = asRecord(body);
  const activityType = await createActivityType(
    context,
    {
      code: required(record.code, "code").toUpperCase(),
      name: required(record.name, "name"),
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      requires_offer: record.requires_offer === true,
    },
    requestId,
  );

  return { activity_type: serializeActivityType(activityType) };
}
