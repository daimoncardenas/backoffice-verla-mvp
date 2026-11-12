import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { assertSameOrigin } from "@/backend/modules/auth/services/csrf.service";
import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  handlePublish,
  offerErrorResponse,
} from "@/backend/modules/offer/controllers/offer.controller";

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
    body = {};
  }

  const { id } = await params;
  const requestId =
    request.headers.get("x-request-id")?.trim() || randomUUID();

  try {
    return NextResponse.json(
      await handlePublish(context, id, body, requestId),
    );
  } catch (error) {
    return offerErrorResponse(error);
  }
}
