import { randomUUID } from "node:crypto";

import { connection, NextResponse } from "next/server";

import { assertSameOrigin } from "@/backend/modules/auth/services/csrf.service";
import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  activityErrorResponse,
  handleCreate,
  handleList,
} from "@/backend/modules/activity/controllers/activity.controller";

export async function GET(_request: Request) {
  await connection();

  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await handleList(context));
  } catch (error) {
    return activityErrorResponse(error);
  }
}

export async function POST(request: Request) {
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

  const requestId =
    request.headers.get("x-request-id")?.trim() || randomUUID();

  try {
    const result = await handleCreate(context, body, requestId);

    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
    });
  } catch (error) {
    return activityErrorResponse(error);
  }
}
