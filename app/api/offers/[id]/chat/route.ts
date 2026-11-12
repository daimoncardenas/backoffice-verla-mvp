import { randomUUID } from "node:crypto";

import { connection, NextResponse } from "next/server";

import { assertSameOrigin } from "@/backend/modules/auth/services/csrf.service";
import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  listOfferChat,
  OfferChatConflictError,
  OfferChatError,
  sendOfferChat,
} from "@/backend/modules/offer/services/offer-chat.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function chatErrorResponse(error: unknown) {
  if (error instanceof OfferChatConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof OfferChatError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof Error && error.name === "ForbiddenError") {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  console.error("Offer chat failed", error);
  return NextResponse.json(
    { error: "No se pudo procesar la corrección." },
    { status: 500 },
  );
}

export async function GET(_request: Request, { params }: RouteContext) {
  await connection();
  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    return NextResponse.json(await listOfferChat(context, id));
  } catch (error) {
    return chatErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
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
      await sendOfferChat(context, id, body, requestId),
    );
  } catch (error) {
    return chatErrorResponse(error);
  }
}
