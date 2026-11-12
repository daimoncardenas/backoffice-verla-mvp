import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  getOrganizationProfile,
  OrganizationProfileConflictError,
  OrganizationProfileValidationError,
  updateOrganizationProfile,
} from "../services/organization-profile.service";

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new OrganizationProfileValidationError("Invalid request body");
  }
  return body as Record<string, unknown>;
}

export async function handleGet(context: AuthContext) {
  return { profile: await getOrganizationProfile(context) };
}

export async function handleUpdate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const record = asRecord(body);

  if (
    typeof record.expectedVersion !== "number" ||
    !Number.isInteger(record.expectedVersion) ||
    record.expectedVersion < 0
  ) {
    throw new OrganizationProfileValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  if (
    "expectedOrganizationVersion" in record &&
    (typeof record.expectedOrganizationVersion !== "number" ||
      !Number.isInteger(record.expectedOrganizationVersion) ||
      record.expectedOrganizationVersion < 0)
  ) {
    throw new OrganizationProfileValidationError(
      "expectedOrganizationVersion must be a non-negative integer",
    );
  }

  const profile = await updateOrganizationProfile(
    context,
    {
      display_name:
        typeof record.display_name === "string"
          ? record.display_name
          : undefined,
      contact_email:
        typeof record.contact_email === "string"
          ? record.contact_email
          : undefined,
      phone:
        typeof record.phone === "string" ? record.phone : undefined,
      expectedVersion: record.expectedVersion,
      expectedOrganizationVersion:
        typeof record.expectedOrganizationVersion === "number"
          ? record.expectedOrganizationVersion
          : undefined,
    },
    requestId,
  );

  return { profile };
}

export function organizationProfileErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof OrganizationProfileValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof OrganizationProfileConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
