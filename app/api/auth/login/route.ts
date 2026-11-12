import { NextResponse } from "next/server";

import {
  AuthenticationError,
  loginWithPassword,
} from "@/backend/modules/auth/services/auth.service";
import { assertSameOrigin } from "@/backend/modules/auth/services/csrf.service";
import { SESSION_COOKIE_NAME } from "@/backend/modules/auth/constants";
import {
  serializeSessionWithPermissions,
  sessionCookieOptions,
} from "@/backend/modules/auth/services/session.service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, password } = body as {
    email?: unknown;
    password?: unknown;
  };

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const { token, context } = await loginWithPassword(email, password);
    const response = NextResponse.json({
      user: await serializeSessionWithPermissions(context),
    });

    response.cookies.set(
      SESSION_COOKIE_NAME,
      token,
      sessionCookieOptions(),
    );

    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
