import "server-only";

import type { QueryFilter, Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import {
  PermissionModel,
  type Permission,
} from "../entities/permission.entity";
import { PartnerModel } from "../../partner/entities/partner.entity";

export function activePermissionFilter(
  organizationId: Types.ObjectId,
): QueryFilter<Permission> {
  return {
    organization_id: organizationId,
    is_active: true,
  };
}

export function activePermissionIdsFilter(
  permissionIds: readonly Types.ObjectId[],
  organizationId: Types.ObjectId,
): QueryFilter<Permission> {
  return {
    _id: { $in: [...permissionIds] },
    organization_id: organizationId,
    is_active: true,
  };
}

export async function listActivePermissions(
  organizationId: Types.ObjectId,
) {
  await connectToDatabase();

  return PermissionModel.find(activePermissionFilter(organizationId)).sort({
    code: 1,
  });
}

export async function findActivePermission(
  permissionId: Types.ObjectId,
  organizationId: Types.ObjectId,
) {
  await connectToDatabase();

  return PermissionModel.findOne({
    _id: permissionId,
    organization_id: organizationId,
    is_active: true,
  });
}

export async function findActivePermissionsByIds(
  permissionIds: readonly Types.ObjectId[],
  organizationId: Types.ObjectId,
) {
  await connectToDatabase();

  return PermissionModel.find(
    activePermissionIdsFilter(permissionIds, organizationId),
  ).select("code");
}

export async function findPartnerPermissionCeiling(
  partnerId: Types.ObjectId,
  organizationId: Types.ObjectId,
) {
  await connectToDatabase();

  return PartnerModel.findOne({
    _id: partnerId,
    organization_id: organizationId,
  }).select("enabled_permission_ids");
}
