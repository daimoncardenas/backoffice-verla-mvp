import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { assertSameOrigin } from "@/backend/modules/auth/services/csrf.service";
import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  employeeErrorResponse,
  handleStatus,
} from "@/backend/modules/employee/controllers/employee.controller";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
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
      await handleStatus(context, id, body, requestId),
    );
  } catch (error) {
    return employeeErrorResponse(error);
  }
}
