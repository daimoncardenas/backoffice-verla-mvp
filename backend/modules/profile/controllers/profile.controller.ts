import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  ProfileConflictError,
  ProfileNotFoundError,
  ProfileValidationError,
} from "../services/profile.errors";
import {
  changeProfilePassword,
  getProfile,
  updateProfile,
} from "../services/profile.service";
import type {
  ChangePasswordInput,
  UpdateProfileInput,
} from "../types/profile.types";

const ALLOWED_FIELDS = [
  "expectedVersion",
  "expectedProfileVersion",
  "display_name",
  "theme",
  "first_name",
  "last_name",
  "email",
  "phone",
  "job_title",
  "contact_name",
  "contact_email",
  "address",
] as const;

const EDITABLE_FIELDS = [
  "display_name",
  "theme",
  "first_name",
  "last_name",
  "email",
  "phone",
  "job_title",
  "contact_name",
  "contact_email",
  "address",
] as const;

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ProfileValidationError("Invalid request body");
  }

  return body as Record<string, unknown>;
}

function assertAllowedFields(record: Record<string, unknown>): void {
  for (const field of Object.keys(record)) {
    if (!(ALLOWED_FIELDS as readonly string[]).includes(field)) {
      throw new ProfileValidationError(`${field} is not editable`);
    }
  }
}

function parseExpectedVersion(record: Record<string, unknown>): number {
  if (
    typeof record.expectedVersion !== "number" ||
    !Number.isInteger(record.expectedVersion) ||
    record.expectedVersion < 0
  ) {
    throw new ProfileValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  return record.expectedVersion;
}

function parseExpectedProfileVersion(
  record: Record<string, unknown>,
): number | undefined {
  if (!("expectedProfileVersion" in record)) {
    return undefined;
  }

  if (
    typeof record.expectedProfileVersion !== "number" ||
    !Number.isInteger(record.expectedProfileVersion) ||
    record.expectedProfileVersion < 0
  ) {
    throw new ProfileValidationError(
      "expectedProfileVersion must be a non-negative integer",
    );
  }

  return record.expectedProfileVersion;
}

function parseText(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ProfileValidationError(`${field} must be a string`);
  }

  return value;
}

function parseTheme(value: unknown): "LIGHT" | "DARK" | "SYSTEM" {
  if (value !== "LIGHT" && value !== "DARK" && value !== "SYSTEM") {
    throw new ProfileValidationError("theme is invalid");
  }

  return value;
}

function parseAddress(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ProfileValidationError("address must be a string or null");
  }

  return value;
}

export function parseUpdateInput(
  body: unknown,
): { input: UpdateProfileInput; record: Record<string, unknown> } {
  const record = asRecord(body);
  assertAllowedFields(record);

  if (
    !EDITABLE_FIELDS.some((field) => field in record)
  ) {
    throw new ProfileValidationError("At least one profile field is required");
  }

  const input: UpdateProfileInput = {
    expectedVersion: parseExpectedVersion(record),
    expectedProfileVersion: parseExpectedProfileVersion(record),
  };

  if ("display_name" in record) {
    input.display_name = parseText(record.display_name, "display_name");
  }
  if ("theme" in record) {
    input.theme = parseTheme(record.theme);
  }
  if ("first_name" in record) {
    input.first_name = parseText(record.first_name, "first_name");
  }
  if ("last_name" in record) {
    input.last_name = parseText(record.last_name, "last_name");
  }
  if ("email" in record) {
    input.email = parseText(record.email, "email");
  }
  if ("phone" in record) {
    input.phone = parseText(record.phone, "phone");
  }
  if ("job_title" in record) {
    input.job_title = parseText(record.job_title, "job_title");
  }
  if ("contact_name" in record) {
    input.contact_name = parseText(record.contact_name, "contact_name");
  }
  if ("contact_email" in record) {
    input.contact_email = parseText(record.contact_email, "contact_email");
  }
  if ("address" in record) {
    input.address = parseAddress(record.address);
  }

  return { input, record };
}

export function parsePasswordInput(body: unknown): ChangePasswordInput {
  const record = asRecord(body);
  const passwordFields = [
    "current_password",
    "new_password",
    "expectedVersion",
  ] as const;

  for (const field of Object.keys(record)) {
    if (!(passwordFields as readonly string[]).includes(field)) {
      throw new ProfileValidationError(`${field} is not allowed`);
    }
  }

  if (typeof record.current_password !== "string") {
    throw new ProfileValidationError("current_password must be a string");
  }

  if (typeof record.new_password !== "string") {
    throw new ProfileValidationError("new_password must be a string");
  }

  if (record.new_password.length === 0) {
    throw new ProfileValidationError("new_password is required");
  }

  return {
    current_password: record.current_password,
    new_password: record.new_password,
    expectedVersion: parseExpectedVersion(record),
  };
}

export async function handleGet(context: AuthContext) {
  return getProfile(context);
}

export async function handlePassword(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const input = parsePasswordInput(body);

  await changeProfilePassword(context, input, requestId);

  return { ok: true };
}

export async function handleUpdate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const { input, record } = parseUpdateInput(body);

  return updateProfile(context, input, record, requestId);
}

export function profileErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof ProfileValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof ProfileNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ProfileConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
