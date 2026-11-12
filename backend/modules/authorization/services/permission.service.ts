import "server-only";

import type { Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { EmployeeModel } from "../../employee/entities/employee.entity";
import { EmployeeTypeModel } from "../../employee-type/entities/employee-type.entity";
import { PartnerModel } from "../../partner/entities/partner.entity";
import { PermissionModel } from "../../permission/entities/permission.entity";
import type { AuthContext } from "../../auth/types/auth.types";

const RESOURCE_ACTIONS: Record<string, readonly string[]> = {
  PARTNER: ["LIST", "READ", "CREATE", "UPDATE", "DELETE"],
  EMPLOYEE: [
    "LIST",
    "READ",
    "CREATE",
    "UPDATE",
    "DELETE",
    "STATUS_UPDATE",
    "ASSIGN_COORDINATOR",
  ],
  EMPLOYEE_TYPE: ["LIST", "READ", "CREATE", "UPDATE", "DELETE"],
  GOAL: ["LIST", "READ", "CREATE", "UPDATE", "DELETE", "ASSIGN", "METRICS"],
  ACTIVITY: ["LIST", "READ", "CREATE", "UPDATE", "DELETE"],
  OFFER: ["LIST", "READ", "CREATE", "UPDATE", "DELETE", "PUBLISH", "DISCARD"],
  CITY: ["LIST", "READ", "CREATE", "UPDATE", "DELETE"],
  ACTIVITY_TYPE: ["LIST", "READ", "CREATE", "UPDATE", "DELETE"],
  PERMISSION: ["LIST", "READ", "CREATE", "UPDATE", "DELETE", "ASSIGN"],
  HISTORY: ["LIST", "READ"],
  DASHBOARD: ["READ"],
  PROFILE: ["READ", "UPDATE"],
  AI_SEARCH_SETTINGS: ["READ", "UPDATE"],
  OFFER_CHAT: ["LIST", "CREATE"],
};

const PERMISSION_RESOURCES = Object.keys(RESOURCE_ACTIONS).sort(
  (left, right) => right.length - left.length,
);

export class ForbiddenError extends Error {
  constructor(requiredPermission: string) {
    super(`Missing permission: ${requiredPermission}`);
    this.name = "ForbiddenError";
  }
}

export function hasPermissionCode(
  grantedPermissions: readonly string[],
  requiredPermission: string,
): boolean {
  if (grantedPermissions.includes(requiredPermission)) {
    return true;
  }

  const resource = PERMISSION_RESOURCES.find((candidate) =>
    requiredPermission.startsWith(`${candidate}_`),
  );

  return resource
    ? grantedPermissions.includes(`${resource}_ALL`)
    : false;
}

export function expandPermissionCodes(
  codes: readonly string[],
): Set<string> {
  const expanded = new Set<string>();

  for (const code of codes) {
    expanded.add(code);

    if (!code.endsWith("_ALL")) {
      continue;
    }

    const resource = code.slice(0, -4);
    const actions = RESOURCE_ACTIONS[resource];

    if (!actions) {
      continue;
    }

    for (const action of actions) {
      expanded.add(`${resource}_${action}`);
    }
  }

  return expanded;
}

export function expandPermissionActions(
  codes: readonly string[],
): Set<string> {
  const expanded = new Set<string>();

  for (const code of codes) {
    if (code.endsWith("_ALL")) {
      const resource = code.slice(0, -4);
      const actions = RESOURCE_ACTIONS[resource];

      if (actions) {
        for (const action of actions) {
          expanded.add(`${resource}_${action}`);
        }
        continue;
      }
    }

    expanded.add(code);
  }

  return expanded;
}

export function combinePermissionCodes(
  roleCodes: readonly string[],
  additionalCodes: readonly string[] | null,
): string[] {
  return [
    ...expandPermissionCodes([
      ...roleCodes,
      ...(additionalCodes ?? []),
    ]),
  ].sort();
}

function codesForIds(
  ids: readonly Types.ObjectId[],
  codeById: Map<string, string>,
): string[] {
  return ids
    .map((id) => codeById.get(id.toString()))
    .filter((code): code is string => code !== undefined);
}

function uniqueObjectIds(
  ids: readonly Types.ObjectId[],
): Types.ObjectId[] {
  const unique = new Map<string, Types.ObjectId>();

  for (const id of ids) {
    unique.set(id.toString(), id);
  }

  return [...unique.values()];
}

async function loadPermissionCodes(
  ids: readonly Types.ObjectId[],
  organizationId: Types.ObjectId,
): Promise<Map<string, string>> {
  const codeById = new Map<string, string>();

  if (ids.length === 0) {
    return codeById;
  }

  const permissions = await PermissionModel.find({
    _id: { $in: ids },
    organization_id: organizationId,
    is_active: true,
  })
    .select("code")
    .lean();

  for (const permission of permissions) {
    codeById.set(permission._id.toString(), permission.code);
  }

  return codeById;
}

export async function resolveEffectivePermissions(
  context: AuthContext,
): Promise<string[]> {
  await connectToDatabase();

  if (context.account_type === "ORGANIZATION") {
    const permissions = await PermissionModel.find({
      organization_id: context.organization_id,
      is_active: true,
    })
      .select("code")
      .lean();

    return [
      ...expandPermissionCodes(permissions.map((permission) => permission.code)),
    ].sort();
  }

  if (context.account_type === "PARTNER") {
    const partner = await PartnerModel.findOne({
      _id: context.partner_id,
      organization_id: context.organization_id,
    });

    if (!partner) {
      return [];
    }

    const codeById = await loadPermissionCodes(
      partner.enabled_permission_ids,
      context.organization_id,
    );

    return [
      ...expandPermissionCodes(
        codesForIds(partner.enabled_permission_ids, codeById),
      ),
    ].sort();
  }

  if (!context.employee_id) {
    return [];
  }

  const employee = await EmployeeModel.findOne({
    _id: context.employee_id,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
  });

  if (!employee) {
    return [];
  }

  const employeeType = await EmployeeTypeModel.findOne({
    _id: employee.employee_type_id,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    is_active: true,
    deleted_at: null,
  });

  const rolePermissionIds = employeeType
    ? employeeType.permission_ids
    : [];
  const additionalPermissionIds = employee.additional_permission ?? [];
  const codeById = await loadPermissionCodes(
    uniqueObjectIds([...rolePermissionIds, ...additionalPermissionIds]),
    context.organization_id,
  );

  return combinePermissionCodes(
    codesForIds(rolePermissionIds, codeById),
    codesForIds(additionalPermissionIds, codeById),
  );
}

export async function hasPermission(
  context: AuthContext,
  requiredPermission: string,
): Promise<boolean> {
  const grantedPermissions = await resolveEffectivePermissions(context);
  return hasPermissionCode(grantedPermissions, requiredPermission);
}

export async function assertPermission(
  context: AuthContext,
  requiredPermission: string,
): Promise<void> {
  if (!(await hasPermission(context, requiredPermission))) {
    throw new ForbiddenError(requiredPermission);
  }
}
