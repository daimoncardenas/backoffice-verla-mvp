import { randomUUID } from "node:crypto";

import { connection, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/backend/modules/auth/constants";
import { assertSameOrigin } from "@/backend/modules/auth/services/csrf.service";
import {
  getSessionFromCookies,
  sessionCookieOptions,
} from "@/backend/modules/auth/services/session.service";
import {
  handlePassword,
  profileErrorResponse,
} from "@/backend/modules/profile/controllers/profile.controller";

export async function POST(request: Request) {
  await connection();

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
    const result = await handlePassword(context, body, requestId);
    const response = NextResponse.json(result);

    response.cookies.set(SESSION_COOKIE_NAME, "", {
      ...sessionCookieOptions(),
      maxAge: 0,
    });

    return response;
  } catch (error) {
    return profileErrorResponse(error);
  }
}
