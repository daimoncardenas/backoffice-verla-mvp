import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { PermissionNotFoundError } from "../services/permission.errors";
import {
  createPermission,
  getAssignablePermission,
  listAssignablePermissions,
  PermissionConflictError,
  PermissionValidationError,
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

  if (error instanceof PermissionValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof PermissionConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PermissionValidationError("Invalid request body");
  }
  return body as Record<string, unknown>;
}

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PermissionValidationError(`${field} is required`);
  }
  return value.trim();
}

export async function handleCreate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const record = asRecord(body);
  const permission = await createPermission(
    context,
    {
      code: required(record.code, "code").toUpperCase(),
      resource: required(record.resource, "resource").toUpperCase(),
      action: required(record.action, "action").toUpperCase(),
      name: required(record.name, "name"),
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
    },
    requestId,
  );

  return { permission: serializePermission(permission) };
}
