import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  EmployeeTypeConflictError,
  EmployeeTypeNotFoundError,
  EmployeeTypeValidationError,
  PermissionNotAssignableError,
} from "../services/employee-type.errors";
import {
  createEmployeeType,
  deleteEmployeeType,
  getEmployeeType,
  listAssignableEmployeeTypes,
  listEmployeeTypes,
  updateEmployeeType,
} from "../services/employee-type.service";
import type {
  CreateEmployeeTypeInput,
  UpdateEmployeeTypeInput,
} from "../types/employee-type.types";

type EmployeeTypeDocument = Awaited<ReturnType<typeof getEmployeeType>>;

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new EmployeeTypeValidationError("Invalid request body");
  }

  return body as Record<string, unknown>;
}

function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new EmployeeTypeValidationError(`${field} is required`);
  }

  return value.trim();
}

function parseOptionalString(value: unknown, field: string): string {
  return parseRequiredString(value, field);
}

function parseDescription(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new EmployeeTypeValidationError(
      "description must be a string or null",
    );
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePermissionIds(value: unknown): Types.ObjectId[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new EmployeeTypeValidationError(
      "permission_ids must be an array",
    );
  }

  return value.map((id) => {
    if (typeof id !== "string" || !Types.ObjectId.isValid(id)) {
      throw new EmployeeTypeValidationError(
        "permission_ids contains an invalid id",
      );
    }

    return new Types.ObjectId(id);
  });
}

function parseOptionalPermissionIds(
  value: unknown,
): Types.ObjectId[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parsePermissionIds(value);
}

function parseExpectedVersion(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new EmployeeTypeValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  return value;
}

function parseEmployeeTypeId(value: unknown): Types.ObjectId {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new EmployeeTypeValidationError("Invalid employee type id");
  }

  return new Types.ObjectId(value);
}

function parseCreateInput(body: unknown): CreateEmployeeTypeInput {
  const record = asRecord(body);

  return {
    code: parseRequiredString(record.code, "code"),
    name: parseRequiredString(record.name, "name"),
    description: parseDescription(record.description),
    permission_ids: parsePermissionIds(record.permission_ids),
  };
}

function parseUpdateInput(body: unknown): UpdateEmployeeTypeInput {
  const record = asRecord(body);
  const input: UpdateEmployeeTypeInput = {
    expectedVersion: parseExpectedVersion(record.expectedVersion),
  };

  if ("code" in record) {
    input.code = parseOptionalString(record.code, "code");
  }

  if ("name" in record) {
    input.name = parseOptionalString(record.name, "name");
  }

  if ("description" in record) {
    input.description = parseDescription(record.description);
  }

  if ("permission_ids" in record) {
    input.permission_ids = parseOptionalPermissionIds(record.permission_ids);
  }

  if ("is_active" in record) {
    if (typeof record.is_active !== "boolean") {
      throw new EmployeeTypeValidationError("is_active must be a boolean");
    }
    input.is_active = record.is_active;
  }

  return input;
}

function serializeEmployeeType(employeeType: EmployeeTypeDocument) {
  return {
    id: employeeType._id.toString(),
    code: employeeType.code,
    name: employeeType.name,
    description: employeeType.description,
    permission_ids: employeeType.permission_ids.map((id) => id.toString()),
    is_system: employeeType.is_system,
    is_active: employeeType.is_active,
    version: employeeType.version,
    created_at: employeeType.created_at.toISOString(),
    updated_at: employeeType.updated_at.toISOString(),
  };
}

export async function handleList(context: AuthContext) {
  const employeeTypes = await listEmployeeTypes(context);

  return {
    employee_types: employeeTypes.map(serializeEmployeeType),
  };
}

export async function handleListAssignable(context: AuthContext) {
  const employeeTypes = await listAssignableEmployeeTypes(context);

  return {
    employee_types: employeeTypes.map((employeeType) => ({
      id: employeeType._id.toString(),
      code: employeeType.code,
      name: employeeType.name,
    })),
  };
}

export async function handleGet(
  context: AuthContext,
  employeeTypeId: string,
) {
  const employeeType = await getEmployeeType(
    context,
    parseEmployeeTypeId(employeeTypeId),
  );

  return {
    employee_type: serializeEmployeeType(employeeType),
  };
}

export async function handleCreate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const employeeType = await createEmployeeType(
    context,
    parseCreateInput(body),
    requestId,
  );

  return {
    employee_type: serializeEmployeeType(employeeType),
  };
}

export async function handleUpdate(
  context: AuthContext,
  employeeTypeId: string,
  body: unknown,
  requestId: string,
) {
  const employeeType = await updateEmployeeType(
    context,
    parseEmployeeTypeId(employeeTypeId),
    parseUpdateInput(body),
    requestId,
  );

  return {
    employee_type: serializeEmployeeType(employeeType),
  };
}

export async function handleDelete(
  context: AuthContext,
  employeeTypeId: string,
  body: unknown,
  requestId: string,
): Promise<void> {
  const record = asRecord(body);

  await deleteEmployeeType(
    context,
    parseEmployeeTypeId(employeeTypeId),
    parseExpectedVersion(record.expectedVersion),
    requestId,
  );
}

export function employeeTypeErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof PermissionNotAssignableError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof EmployeeTypeValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof EmployeeTypeNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof EmployeeTypeConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
