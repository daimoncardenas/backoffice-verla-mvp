import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  EmployeeAccessError,
  EmployeeConflictError,
  EmployeeNotFoundError,
  EmployeePermissionNotAssignableError,
  EmployeeValidationError,
} from "../services/employee.errors";
import {
  changeEmployeeStatus,
  changeSupervisor,
  createEmployee,
  deleteEmployee,
  getEmployee,
  listAssignments,
  listEmployees,
  updateEmployee,
} from "../services/employee.service";
import type {
  ChangeEmployeeStatusInput,
  ChangeSupervisorInput,
  CreateEmployeeInput,
  DeleteEmployeeInput,
  ListEmployeeFilters,
  UpdateEmployeeInput,
} from "../types/employee.types";

type EmployeeDetail = Awaited<ReturnType<typeof getEmployee>>;
type AssignmentDocument = NonNullable<EmployeeDetail["current_assignment"]>;

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new EmployeeValidationError("Invalid request body");
  }

  return body as Record<string, unknown>;
}

function parseObjectId(value: unknown, field: string): Types.ObjectId {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new EmployeeValidationError(`${field} is invalid`);
  }

  return new Types.ObjectId(value);
}

function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new EmployeeValidationError(`${field} is required`);
  }

  return value.trim();
}

function parseOptionalString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseRequiredString(value, field);
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new EmployeeValidationError(`${field} is invalid`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new EmployeeValidationError(`${field} is invalid`);
  }

  return date;
}

function parseCityIds(value: unknown): Types.ObjectId[] {
  if (!Array.isArray(value)) {
    throw new EmployeeValidationError("city_ids must be an array");
  }

  return value.map((id) => parseObjectId(id, "city_ids"));
}

function parseOptionalPermissionIds(
  value: unknown,
): Types.ObjectId[] | null {
  if (value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new EmployeeValidationError(
      "additional_permission must be an array or null",
    );
  }

  return value.map((id) =>
    parseObjectId(id, "additional_permission"),
  );
}

function parseListFilters(searchParams: URLSearchParams): ListEmployeeFilters {
  const filters: ListEmployeeFilters = {};
  const employeeTypeId = searchParams.get("employee_type_id");
  const cityId = searchParams.get("city_id");
  const status = searchParams.get("status");

  if (employeeTypeId) {
    filters.employee_type_id = parseObjectId(
      employeeTypeId,
      "employee_type_id",
    );
  }

  if (cityId) {
    filters.city_id = parseObjectId(cityId, "city_id");
  }

  if (status) {
    if (
      status !== "ACTIVE" &&
      status !== "INACTIVE" &&
      status !== "BLOCKED"
    ) {
      throw new EmployeeValidationError("status is invalid");
    }
    filters.status = status;
  }

  return filters;
}

export function parseCreateInput(body: unknown): CreateEmployeeInput {
  const record = asRecord(body);
  const supervisorValue = record.supervisor_id;
  const additionalValue = record.additional_permission;

  return {
    employee_type_id: parseObjectId(
      record.employee_type_id,
      "employee_type_id",
    ),
    first_name: parseRequiredString(record.first_name, "first_name"),
    last_name: parseRequiredString(record.last_name, "last_name"),
    document_type: parseRequiredString(record.document_type, "document_type"),
    document_number: parseRequiredString(
      record.document_number,
      "document_number",
    ),
    email: parseRequiredString(record.email, "email").toLowerCase(),
    phone: parseRequiredString(record.phone, "phone"),
    job_title: parseRequiredString(record.job_title, "job_title"),
    hired_at: parseDate(record.hired_at, "hired_at"),
    city_ids: parseCityIds(record.city_ids),
    supervisor_id:
      supervisorValue === undefined || supervisorValue === null
        ? null
        : parseObjectId(supervisorValue, "supervisor_id"),
    additional_permission:
      additionalValue === undefined
        ? null
        : parseOptionalPermissionIds(additionalValue),
  };
}

export function parseUpdateInput(body: unknown): UpdateEmployeeInput {
  const record = asRecord(body);

  if ("supervisor_id" in record && !("employee_type_id" in record)) {
    throw new EmployeeValidationError(
      "supervisor_id is only allowed together with employee_type_id",
    );
  }

  if (
    typeof record.expectedVersion !== "number" ||
    !Number.isInteger(record.expectedVersion) ||
    record.expectedVersion < 0
  ) {
    throw new EmployeeValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const input: UpdateEmployeeInput = {
    expectedVersion: record.expectedVersion,
  };

  if ("first_name" in record) {
    input.first_name = parseRequiredString(record.first_name, "first_name");
  }
  if ("last_name" in record) {
    input.last_name = parseRequiredString(record.last_name, "last_name");
  }
  if ("phone" in record) {
    input.phone = parseRequiredString(record.phone, "phone");
  }
  if ("job_title" in record) {
    input.job_title = parseRequiredString(record.job_title, "job_title");
  }
  if ("city_ids" in record) {
    input.city_ids = parseCityIds(record.city_ids);
  }
  if ("additional_permission" in record) {
    input.additional_permission = parseOptionalPermissionIds(
      record.additional_permission,
    );
  }
  if ("employee_type_id" in record) {
    input.employee_type_id = parseObjectId(
      record.employee_type_id,
      "employee_type_id",
    );
  }
  if ("supervisor_id" in record) {
    input.supervisor_id =
      record.supervisor_id === null
        ? null
        : parseObjectId(record.supervisor_id, "supervisor_id");
  }

  return input;
}

function parseSupervisorInput(body: unknown): ChangeSupervisorInput {
  const record = asRecord(body);

  if (
    typeof record.expectedVersion !== "number" ||
    !Number.isInteger(record.expectedVersion) ||
    record.expectedVersion < 0
  ) {
    throw new EmployeeValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  return {
    expectedVersion: record.expectedVersion,
    supervisor_id: parseObjectId(record.supervisor_id, "supervisor_id"),
  };
}

function parseExpectedVersion(record: Record<string, unknown>): number {
  if (
    typeof record.expectedVersion !== "number" ||
    !Number.isInteger(record.expectedVersion) ||
    record.expectedVersion < 0
  ) {
    throw new EmployeeValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  return record.expectedVersion;
}

export function parseStatusInput(body: unknown): ChangeEmployeeStatusInput {
  const record = asRecord(body);
  const allowedFields = ["expectedVersion", "status", "status_reason"];

  for (const field of Object.keys(record)) {
    if (!allowedFields.includes(field)) {
      throw new EmployeeValidationError(`${field} is not allowed`);
    }
  }

  if (
    record.status !== "ACTIVE" &&
    record.status !== "INACTIVE" &&
    record.status !== "BLOCKED"
  ) {
    throw new EmployeeValidationError("status is invalid");
  }

  if (
    "status_reason" in record &&
    record.status_reason !== null &&
    typeof record.status_reason !== "string"
  ) {
    throw new EmployeeValidationError("status_reason must be a string");
  }

  if (
    record.status !== "ACTIVE" &&
    (typeof record.status_reason !== "string" ||
      record.status_reason.trim().length === 0)
  ) {
    throw new EmployeeValidationError(
      "status_reason is required for INACTIVE or BLOCKED",
    );
  }

  return {
    expectedVersion: parseExpectedVersion(record),
    status: record.status,
    status_reason:
      record.status === "ACTIVE"
        ? null
        : (record.status_reason as string),
  };
}

export function parseDeleteInput(body: unknown): DeleteEmployeeInput {
  const record = asRecord(body);
  const allowedFields = ["expectedVersion"];

  for (const field of Object.keys(record)) {
    if (!allowedFields.includes(field)) {
      throw new EmployeeValidationError(`${field} is not allowed`);
    }
  }

  return {
    expectedVersion: parseExpectedVersion(record),
  };
}

function serializeAssignment(assignment: AssignmentDocument) {
  return {
    id: assignment._id.toString(),
    employee_type_id: assignment.employee_type_id.toString(),
    supervisor_id: assignment.supervisor_id?.toString() ?? null,
    valid_from: assignment.valid_from.toISOString(),
    valid_to: assignment.valid_to?.toISOString() ?? null,
    version: assignment.version,
  };
}

function serializeEmployee(employee: EmployeeDetail["employee"]) {
  return {
    id: employee._id.toString(),
    employee_type_id: employee.employee_type_id.toString(),
    first_name: employee.first_name,
    last_name: employee.last_name,
    document_type: employee.document_type,
    document_number: employee.document_number,
    email: employee.email,
    phone: employee.phone,
    job_title: employee.job_title,
    hired_at: employee.hired_at.toISOString(),
    city_ids: employee.city_ids.map((id) => id.toString()),
    supervisor_id: employee.supervisor_id?.toString() ?? null,
    additional_permission:
      employee.additional_permission?.map((id) => id.toString()) ?? null,
    status: employee.status,
    version: employee.version,
    created_at: employee.created_at.toISOString(),
    updated_at: employee.updated_at.toISOString(),
  };
}

export async function handleList(
  context: AuthContext,
  searchParams: URLSearchParams,
) {
  const employees = await listEmployees(
    context,
    parseListFilters(searchParams),
  );

  return { employees: employees.map(serializeEmployee) };
}

export async function handleGet(
  context: AuthContext,
  employeeId: string,
) {
  const detail = await getEmployee(
    context,
    parseObjectId(employeeId, "employee id"),
  );

  return {
    employee: serializeEmployee(detail.employee),
    current_assignment: detail.current_assignment
      ? serializeAssignment(detail.current_assignment)
      : null,
  };
}

export async function handleCreate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const employee = await createEmployee(
    context,
    parseCreateInput(body),
    requestId,
  );

  return { employee: serializeEmployee(employee) };
}

export async function handleUpdate(
  context: AuthContext,
  employeeId: string,
  body: unknown,
  requestId: string,
) {
  const employee = await updateEmployee(
    context,
    parseObjectId(employeeId, "employee id"),
    parseUpdateInput(body),
    requestId,
  );

  return { employee: serializeEmployee(employee) };
}

export async function handleSupervisor(
  context: AuthContext,
  employeeId: string,
  body: unknown,
  requestId: string,
) {
  const employee = await changeSupervisor(
    context,
    parseObjectId(employeeId, "employee id"),
    parseSupervisorInput(body),
    requestId,
  );

  return { employee: serializeEmployee(employee) };
}

export async function handleStatus(
  context: AuthContext,
  employeeId: string,
  body: unknown,
  requestId: string,
) {
  const employee = await changeEmployeeStatus(
    context,
    parseObjectId(employeeId, "employee id"),
    parseStatusInput(body),
    requestId,
  );

  return { employee: serializeEmployee(employee) };
}

export async function handleDelete(
  context: AuthContext,
  employeeId: string,
  body: unknown,
  requestId: string,
) {
  await deleteEmployee(
    context,
    parseObjectId(employeeId, "employee id"),
    parseDeleteInput(body),
    requestId,
  );

  return { ok: true };
}

export async function handleAssignments(
  context: AuthContext,
  employeeId: string,
) {
  const assignments = await listAssignments(
    context,
    parseObjectId(employeeId, "employee id"),
  );

  return { assignments: assignments.map(serializeAssignment) };
}

export function employeeErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (
    error instanceof EmployeeAccessError ||
    error instanceof EmployeePermissionNotAssignableError
  ) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof EmployeeValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof EmployeeNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof EmployeeConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
