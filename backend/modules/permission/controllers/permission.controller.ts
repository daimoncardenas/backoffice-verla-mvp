import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { PermissionNotFoundError } from "../services/permission.errors";
import {
  getAssignablePermission,
  listAssignablePermissions,
} from "../services/permission.service";
import type { AssignablePermissionResponse } from "../types/permission.types";

type PermissionDocument = Awaited<
  ReturnType<typeof getAssignablePermission>
>;

function parsePermissionId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new PermissionNotFoundError();
  }

  return new Types.ObjectId(value);
}

export function serializePermission(
  permission: PermissionDocument,
): AssignablePermissionResponse {
  return {
    id: permission._id.toString(),
    code: permission.code,
    resource: permission.resource,
    action: permission.action,
    name: permission.name,
    description: permission.description,
    is_active: permission.is_active,
  };
}

export async function handleList(context: AuthContext) {
  const permissions = await listAssignablePermissions(context);

  return { permissions: permissions.map(serializePermission) };
}

export async function handleGet(
  context: AuthContext,
  permissionId: string,
) {
  const permission = await getAssignablePermission(
    context,
    parsePermissionId(permissionId),
  );

  return { permission: serializePermission(permission) };
}

export function permissionErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof PermissionNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
