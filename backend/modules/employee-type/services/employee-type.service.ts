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
import { PartnerModel } from "../../partner/entities/partner.entity";
import { PermissionModel } from "../../permission/entities/permission.entity";
import {
  recordHistoryChange,
  type AuditContext,
} from "../../history-change/services/history.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  EmployeeTypeModel,
  type EmployeeType,
} from "../entities/employee-type.entity";
import {
  EmployeeTypeConflictError,
  EmployeeTypeNotFoundError,
  EmployeeTypeValidationError,
  PermissionNotAssignableError,
} from "./employee-type.errors";
import {
  countEmployeesForType,
  createEmployeeTypeRecord,
  findEmployeeTypeRecord,
  listEmployeeTypeRecords,
  softDeleteEmployeeTypeRecord,
  updateEmployeeTypeRecord,
} from "../repository/employee-type.repository";
import type {
  CreateEmployeeTypeInput,
  UpdateEmployeeTypeInput,
} from "../types/employee-type.types";

type EmployeeTypeDocument = HydratedDocument<EmployeeType>;

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

function auditSnapshot(
  employeeType: EmployeeTypeDocument,
): Record<string, unknown> {
  return {
    code: employeeType.code,
    name: employeeType.name,
    description: employeeType.description,
    permission_ids: employeeType.permission_ids.map((id) => id.toString()),
    is_system: employeeType.is_system,
    is_active: employeeType.is_active,
  };
}

function buildAuditDiff(
  current: EmployeeTypeDocument,
  changes: Record<string, unknown>,
): {
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
} {
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  const currentValues = current as unknown as Record<string, unknown>;

  for (const key of Object.keys(changes)) {
    const before = currentValues[key];
    const after = changes[key];

    previousValues[key] =
      key === "permission_ids" && Array.isArray(before)
        ? before.map((id) => id.toString())
        : before;
    newValues[key] =
      key === "permission_ids" && Array.isArray(after)
        ? after.map((id) => id.toString())
        : after;
  }

  return { previous_values: previousValues, new_values: newValues };
}

function samePermissionIds(
  currentIds: readonly Types.ObjectId[],
  nextIds: readonly Types.ObjectId[],
): boolean {
  return (
    currentIds.map((id) => id.toString()).sort().join(",") ===
    nextIds.map((id) => id.toString()).sort().join(",")
  );
}

function buildUpdateChanges(
  current: EmployeeTypeDocument,
  input: UpdateEmployeeTypeInput,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};

  if (input.code !== undefined && input.code !== current.code) {
    changes.code = input.code;
  }

  if (input.name !== undefined && input.name !== current.name) {
    changes.name = input.name;
  }

  if (input.description !== undefined && input.description !== current.description) {
    changes.description = input.description;
  }

  if (
    input.permission_ids !== undefined &&
    !samePermissionIds(current.permission_ids, input.permission_ids)
  ) {
    changes.permission_ids = input.permission_ids;
  }

  if (input.is_active !== undefined && input.is_active !== current.is_active) {
    changes.is_active = input.is_active;
  }

  return changes;
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

async function assertAssignablePermissions(
  context: AuthContext,
  permissionIds: readonly Types.ObjectId[],
): Promise<void> {
  if (permissionIds.length === 0) {
    return;
  }

  const uniqueIds = new Set(permissionIds.map((id) => id.toString()));

  if (uniqueIds.size !== permissionIds.length) {
    throw new EmployeeTypeValidationError(
      "permission_ids must not contain duplicates",
    );
  }

  const partner = await PartnerModel.findOne({
    _id: context.partner_id,
    organization_id: context.organization_id,
  });

  if (!partner) {
    throw new EmployeeTypeValidationError("Partner not found");
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
    throw new EmployeeTypeValidationError(
      "One or more permissions do not exist or are inactive",
    );
  }

  const unassignable = findUnassignablePermission(
    assignedPermissions.map((permission) => permission.code),
    enabledPermissions.map((permission) => permission.code),
  );

  if (unassignable) {
    throw new PermissionNotAssignableError(unassignable);
  }
}

export async function listEmployeeTypes(
  context: AuthContext,
): Promise<EmployeeTypeDocument[]> {
  await assertPermission(context, "EMPLOYEE_TYPE_LIST");

  return listEmployeeTypeRecords(
    context.organization_id,
    context.partner_id,
  );
}

/**
 * Minimal catalog for the employee creation form. It does not expose the
 * organization's full role catalog: partners receive their active roles and
 * coordinators only the SELLER role they are allowed to create.
 */
export async function listAssignableEmployeeTypes(
  context: AuthContext,
): Promise<EmployeeTypeDocument[]> {
  await assertPermission(context, "EMPLOYEE_CREATE");

  const employeeTypes = await listEmployeeTypeRecords(
    context.organization_id,
    context.partner_id,
  );
  const activeTypes = employeeTypes.filter((type) => type.is_active);

  if (context.account_type === "PARTNER") {
    return activeTypes;
  }

  return activeTypes.filter((type) => type.code === "SELLER");
}

export async function getEmployeeType(
  context: AuthContext,
  employeeTypeId: Types.ObjectId,
): Promise<EmployeeTypeDocument> {
  await assertPermission(context, "EMPLOYEE_TYPE_READ");

  const employeeType = await findEmployeeTypeRecord(
    employeeTypeId,
    context.organization_id,
    context.partner_id,
  );

  if (!employeeType) {
    throw new EmployeeTypeNotFoundError();
  }

  return employeeType;
}

export async function createEmployeeType(
  context: AuthContext,
  input: CreateEmployeeTypeInput,
  requestId: string,
): Promise<EmployeeTypeDocument> {
  await assertPermission(context, "EMPLOYEE_TYPE_CREATE");
  await assertAssignablePermissions(context, input.permission_ids);

  const auditContext = buildAuditContext(context, requestId);

  try {
    return await withTransaction(async (session) => {
      const created = await createEmployeeTypeRecord(
        {
          organization_id: context.organization_id,
          partner_id: context.partner_id,
          code: input.code,
          name: input.name,
          description: input.description,
          permission_ids: input.permission_ids,
          is_system: false,
          is_active: true,
          created_by: context.account_id,
          updated_by: context.account_id,
          version: 0,
        },
        session,
      );

      await recordHistoryChange(session, auditContext, {
        entity_name: "employee_type",
        record_id: created._id,
        action: "CREATE",
        previous_values: null,
        new_values: auditSnapshot(created),
      });

      return created;
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new EmployeeTypeConflictError(
        "Employee type code already exists",
      );
    }
    throw error;
  }
}

export async function updateEmployeeType(
  context: AuthContext,
  employeeTypeId: Types.ObjectId,
  input: UpdateEmployeeTypeInput,
  requestId: string,
): Promise<EmployeeTypeDocument> {
  await assertPermission(context, "EMPLOYEE_TYPE_UPDATE");

  if (
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 0
  ) {
    throw new EmployeeTypeValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const current = await findEmployeeTypeRecord(
    employeeTypeId,
    context.organization_id,
    context.partner_id,
  );

  if (!current) {
    throw new EmployeeTypeNotFoundError();
  }

  if (current.version !== input.expectedVersion) {
    throw new EmployeeTypeConflictError("Version conflict");
  }

  if (
    input.code !== undefined &&
    input.code !== current.code &&
    current.is_system
  ) {
    throw new EmployeeTypeValidationError(
      "System role code is reserved",
    );
  }

  if (input.permission_ids !== undefined) {
    await assertAssignablePermissions(context, input.permission_ids);
  }

  const changes = buildUpdateChanges(current, input);

  if (Object.keys(changes).length === 0) {
    return current;
  }

  const auditDiff = buildAuditDiff(current, changes);
  const auditContext = buildAuditContext(context, requestId);

  try {
    return await withTransaction(async (session) => {
      const updated = await updateEmployeeTypeRecord(
        {
          _id: employeeTypeId,
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
        const exists = await EmployeeTypeModel.exists({
          _id: employeeTypeId,
          organization_id: context.organization_id,
          partner_id: context.partner_id,
          deleted_at: null,
        }).session(session);

        throw exists
          ? new EmployeeTypeConflictError("Version conflict")
          : new EmployeeTypeNotFoundError();
      }

      await recordHistoryChange(session, auditContext, {
        entity_name: "employee_type",
        record_id: updated._id,
        action: "UPDATE",
        previous_values: auditDiff.previous_values,
        new_values: auditDiff.new_values,
      });

      return updated;
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new EmployeeTypeConflictError(
        "Employee type code already exists",
      );
    }
    throw error;
  }
}

export async function deleteEmployeeType(
  context: AuthContext,
  employeeTypeId: Types.ObjectId,
  expectedVersion: number,
  requestId: string,
): Promise<void> {
  await assertPermission(context, "EMPLOYEE_TYPE_DELETE");

  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new EmployeeTypeValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const current = await findEmployeeTypeRecord(
    employeeTypeId,
    context.organization_id,
    context.partner_id,
  );

  if (!current) {
    throw new EmployeeTypeNotFoundError();
  }

  if (current.version !== expectedVersion) {
    throw new EmployeeTypeConflictError("Version conflict");
  }

  const auditContext = buildAuditContext(context, requestId);

  await withTransaction(async (session) => {
    const employeeCount = await countEmployeesForType(
      employeeTypeId,
      context.organization_id,
      context.partner_id,
      session,
    );

    if (employeeCount > 0) {
      throw new EmployeeTypeConflictError(
        "Employee type is assigned to employees",
      );
    }

    const deleted = await softDeleteEmployeeTypeRecord(
      {
        _id: employeeTypeId,
        organization_id: context.organization_id,
        partner_id: context.partner_id,
        version: expectedVersion,
        deleted_at: null,
      },
      context.account_id,
      session,
    );

    if (!deleted) {
      const exists = await EmployeeTypeModel.exists({
        _id: employeeTypeId,
        organization_id: context.organization_id,
        partner_id: context.partner_id,
        deleted_at: null,
      }).session(session);

      throw exists
        ? new EmployeeTypeConflictError("Version conflict")
        : new EmployeeTypeNotFoundError();
    }

    await recordHistoryChange(session, auditContext, {
      entity_name: "employee_type",
      record_id: deleted._id,
      action: "DELETE",
      previous_values: auditSnapshot(current),
      new_values: null,
    });
  });
}
