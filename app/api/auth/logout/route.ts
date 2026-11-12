import { NextResponse } from "next/server";

import { assertSameOrigin } from "@/backend/modules/auth/services/csrf.service";
import { SESSION_COOKIE_NAME } from "@/backend/modules/auth/constants";
import { sessionCookieOptions } from "@/backend/modules/auth/services/session.service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
