import { randomUUID } from "node:crypto";

import { connection, NextResponse } from "next/server";

import { assertSameOrigin } from "@/backend/modules/auth/services/csrf.service";
import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  employeeTypeErrorResponse,
  handleDelete,
  handleGet,
  handleUpdate,
} from "@/backend/modules/employee-type/controllers/employee-type.controller";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  await connection();

  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    return NextResponse.json(await handleGet(context, id));
  } catch (error) {
    return employeeTypeErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await params;
  const requestId =
    request.headers.get("x-request-id")?.trim() || randomUUID();

  try {
    return NextResponse.json(
      await handleUpdate(context, id, body, requestId),
    );
  } catch (error) {
    return employeeTypeErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteContext,
) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await params;
  const requestId =
    request.headers.get("x-request-id")?.trim() || randomUUID();

  try {
    await handleDelete(context, id, body, requestId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return employeeTypeErrorResponse(error);
  }
}
