import "server-only";

import type { Types } from "mongoose";

import {
  assertPermission,
  expandPermissionActions,
} from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
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
