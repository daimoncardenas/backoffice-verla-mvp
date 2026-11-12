import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { assertSameOrigin } from "@/backend/modules/auth/services/csrf.service";
import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  aiSearchSettingsErrorResponse,
  handleRun,
} from "@/backend/modules/ai-search-settings/controllers/ai-search-settings.controller";

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

  const requestId =
    request.headers.get("x-request-id")?.trim() || randomUUID();
  let body: unknown = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    return NextResponse.json(await handleRun(context, requestId, body), {
      status: 202,
    });
  } catch (error) {
    return aiSearchSettingsErrorResponse(error);
  }
}
