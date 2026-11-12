import "server-only";

import { cookies } from "next/headers";

import { resolveEffectivePermissions } from "../../authorization/services/permission.service";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "../constants";
import type { AuthContext } from "../types/auth.types";
import { getSessionContext } from "./auth.service";

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function getSessionFromCookies(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return getSessionContext(token);
}

export async function requireSession(): Promise<AuthContext> {
  const context = await getSessionFromCookies();

  if (!context) {
    throw new Error("Unauthorized");
  }

  return context;
}

export function serializeSession(context: AuthContext) {
  return {
    id: context.account_id.toString(),
    display_name: context.display_name,
    email: context.email,
    account_type: context.account_type,
    theme: context.theme,
    organization: {
      id: context.organization_id.toString(),
      name: context.organization_name,
      timezone: context.timezone,
    },
    partner_id: context.partner_id.toString(),
    employee_id: context.employee_id?.toString() ?? null,
  };
}

export async function serializeSessionWithPermissions(
  context: AuthContext,
) {
  return {
    ...serializeSession(context),
    permissions: await resolveEffectivePermissions(context),
  };
}
