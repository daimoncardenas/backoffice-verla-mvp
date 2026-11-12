import "server-only";

import mongoose, { Types } from "mongoose";
import { connectToDatabase } from "../../../config/mongodb";
import { recordHistoryChange } from "../../history-change/services/history.service";

import {
  assertPermission,
  expandPermissionActions,
} from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  createPermissionRecord,
  findActivePermission,
  findActivePermissionsByIds,
  findPartnerPermissionCeiling,
  listActivePermissions,
} from "../repository/permission.repository";
import { PermissionNotFoundError } from "./permission.errors";

function isCodeCovered(
  code: string,
  enabledActions: ReadonlySet<string>,
): boolean {
  for (const action of expandPermissionActions([code])) {
    if (!enabledActions.has(action)) {
      return false;
    }
  }

  return true;
}

export function isPermissionAssignable(
  code: string,
  enabledCodes: readonly string[],
): boolean {
  return isCodeCovered(code, expandPermissionActions(enabledCodes));
}

export function filterAssignablePermissions<T extends { code: string }>(
  permissions: readonly T[],
  enabledCodes: readonly string[],
): T[] {
  const enabledActions = expandPermissionActions(enabledCodes);

  return permissions.filter((permission) =>
    isCodeCovered(permission.code, enabledActions),
  );
}

async function loadEnabledPermissionCodes(
  context: AuthContext,
): Promise<string[]> {
  const partner = await findPartnerPermissionCeiling(
    context.partner_id,
    context.organization_id,
  );

  if (!partner) {
    throw new PermissionNotFoundError("Partner not found");
  }

  const enabledPermissions = await findActivePermissionsByIds(
    partner.enabled_permission_ids,
    context.organization_id,
  );

  return enabledPermissions.map((permission) => permission.code);
}

export async function listAssignablePermissions(
  context: AuthContext,
) {
  await assertPermission(context, "PERMISSION_LIST");

  if (context.account_type === "ORGANIZATION") {
    return listActivePermissions(context.organization_id);
  }

  const [permissions, enabledCodes] = await Promise.all([
    listActivePermissions(context.organization_id),
    loadEnabledPermissionCodes(context),
  ]);

  return filterAssignablePermissions(permissions, enabledCodes);
}

export async function getAssignablePermission(
  context: AuthContext,
  permissionId: Types.ObjectId,
) {
  await assertPermission(context, "PERMISSION_READ");

  const permission = await findActivePermission(
    permissionId,
    context.organization_id,
  );

  if (!permission) {
    throw new PermissionNotFoundError();
  }

  const enabledCodes = await loadEnabledPermissionCodes(context);

  if (!isPermissionAssignable(permission.code, enabledCodes)) {
    throw new PermissionNotFoundError();
  }

  return permission;
}

export class PermissionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionValidationError";
  }
}

export class PermissionConflictError extends Error {
  constructor(message = "Permission already exists") {
    super(message);
    this.name = "PermissionConflictError";
  }
}

export interface CreatePermissionInput {
  code: string;
  resource: string;
  action: string;
  name: string;
  description: string | null;
}

export async function createPermission(
  context: AuthContext,
  input: CreatePermissionInput,
  requestId: string,
) {
  await assertPermission(context, "PERMISSION_CREATE");

  if (context.account_type !== "ORGANIZATION") {
    throw new PermissionValidationError(
      "Only the organization can create permissions",
    );
  }

  await connectToDatabase();
  const session = await mongoose.startSession();

  try {
    let createdId: Types.ObjectId | null = null;

    await session.withTransaction(async () => {
      try {
        const created = await createPermissionRecord(
          {
            organization_id: context.organization_id,
            code: input.code,
            resource: input.resource,
            action: input.action,
            name: input.name,
            description: input.description,
            is_active: true,
            created_by: context.account_id,
            updated_by: context.account_id,
            version: 0,
          },
          session,
        );

        createdId = created._id;

        await recordHistoryChange(
          session,
          {
            organization_id: context.organization_id,
            partner_id: null,
            actor_user_id: context.account_id,
            request_id: requestId,
          },
          {
            entity_name: "permission",
            record_id: created._id,
            action: "CREATE",
            previous_values: null,
            new_values: {
              code: created.code,
              resource: created.resource,
              action: created.action,
              name: created.name,
              description: created.description,
              is_active: created.is_active,
              version: created.version,
            },
          },
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          (error as { code?: unknown }).code === 11000
        ) {
          throw new PermissionConflictError(
            "Ya existe un permiso con ese código.",
          );
        }
        throw error;
      }
    });

    if (!createdId) {
      throw new Error("Permission was not created");
    }

    const created = await findActivePermission(
      createdId,
      context.organization_id,
    );

    if (!created) {
      throw new Error("Permission was not created");
    }

    return created;
  } finally {
    await session.endSession();
  }
}
