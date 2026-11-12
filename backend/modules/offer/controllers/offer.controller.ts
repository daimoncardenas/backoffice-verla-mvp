import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  OfferConflictError,
  OfferNotFoundError,
  OfferValidationError,
} from "../services/offer.errors";
import {
  createOffer,
  discardOffer,
  getVisibleOffer,
  listAllOffers,
  listVisibleOffers,
  publishOffer,
} from "../services/offer.service";

type OfferDocument = Awaited<ReturnType<typeof listVisibleOffers>>[number];

function parseOfferId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new OfferValidationError("Invalid offer id");
  }

  return new Types.ObjectId(value);
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new OfferValidationError("Invalid request body");
  }

  return body as Record<string, unknown>;
}

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new OfferValidationError(`${field} is required`);
  }

  return value.trim();
}

function parseNullableDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new OfferValidationError(`${field} is invalid`);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new OfferValidationError(`${field} is invalid`);
  }

  return date;
}

function parseExpectedVersion(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new OfferValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  return value;
}

export function serializeOffer(offer: OfferDocument) {
  return {
    id: offer._id.toString(),
    title: offer.title,
    content: offer.content,
    images: [...offer.images]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((image) => ({
        url: image.url,
        alt_text: image.alt_text,
        sort_order: image.sort_order,
      })),
    starts_at: offer.starts_at?.toISOString() ?? null,
    ends_at: offer.ends_at?.toISOString() ?? null,
    status: offer.status,
    published_at: offer.published_at?.toISOString() ?? null,
    version: offer.version,
    commercial_terms: offer.commercial_terms
      ? {
          price_amount: offer.commercial_terms.price_amount,
          currency: offer.commercial_terms.currency,
          billing_period: offer.commercial_terms.billing_period,
          benefits: [...offer.commercial_terms.benefits],
          conditions: [...offer.commercial_terms.conditions],
        }
      : null,
  };
}

export async function handleList(context: AuthContext) {
  const offers = await listAllOffers(context);

  return { offers: offers.map(serializeOffer) };
}

export async function handleGet(
  context: AuthContext,
  offerId: string,
) {
  const offer = await getVisibleOffer(context, parseOfferId(offerId));

  return { offer: serializeOffer(offer) };
}

export async function handleCreate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const record = asRecord(body);
  const offer = await createOffer(
    context,
    {
      title: required(record.title, "title"),
      content: required(record.content, "content"),
      starts_at: parseNullableDate(record.starts_at, "starts_at"),
      ends_at: parseNullableDate(record.ends_at, "ends_at"),
    },
    requestId,
  );

  return { offer: serializeOffer(offer) };
}

export async function handlePublish(
  context: AuthContext,
  offerId: string,
  body: unknown,
  requestId: string,
) {
  const record = asRecord(body);
  const offer = await publishOffer(
    context,
    parseOfferId(offerId),
    parseExpectedVersion(record.expectedVersion),
    requestId,
  );

  return { offer: serializeOffer(offer) };
}

export async function handleDiscard(
  context: AuthContext,
  offerId: string,
  body: unknown,
  requestId: string,
) {
  const record = asRecord(body);
  const offer = await discardOffer(
    context,
    parseOfferId(offerId),
    parseExpectedVersion(record.expectedVersion),
    requestId,
  );

  return { offer: serializeOffer(offer) };
}

export function offerErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof OfferValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof OfferNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof OfferConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
