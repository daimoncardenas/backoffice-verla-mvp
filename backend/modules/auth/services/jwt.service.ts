import "server-only";

import { SignJWT, jwtVerify } from "jose";

import type { SessionTokenClaims } from "../types/auth.types";

const JWT_ALGORITHM = "HS256";
const SESSION_DURATION = "8h";
const MINIMUM_SECRET_LENGTH = 32;

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error("JWT_SECRET is not defined or is too short");
  }

  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  claims: SessionTokenClaims,
): Promise<string> {
  return new SignJWT({
    organization_id: claims.organization_id,
    token_version: claims.token_version,
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: [JWT_ALGORITHM],
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.organization_id !== "string" ||
      typeof payload.token_version !== "number" ||
      !Number.isInteger(payload.token_version) ||
      typeof payload.exp !== "number" ||
      !Number.isInteger(payload.exp)
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      organization_id: payload.organization_id,
      token_version: payload.token_version,
    };
  } catch {
    return null;
  }
}
