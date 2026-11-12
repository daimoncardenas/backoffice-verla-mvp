import "server-only";

import type { QueryFilter, Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { OfferModel, type Offer } from "../entities/offer.entity";

export function buildVisibleOfferFilter(
  organizationId: Types.ObjectId,
  referenceInstant: Date,
): QueryFilter<Offer> {
  return {
    organization_id: organizationId,
    status: "PUBLISHED",
    deleted_at: null,
    published_at: { $type: "date", $lte: referenceInstant },
    starts_at: { $type: "date", $lte: referenceInstant },
    ends_at: { $type: "date", $gt: referenceInstant },
  };
}

export function buildVisibleOfferDetailFilter(
  offerId: Types.ObjectId,
  organizationId: Types.ObjectId,
  referenceInstant: Date,
): QueryFilter<Offer> {
  return {
    ...buildVisibleOfferFilter(organizationId, referenceInstant),
    _id: offerId,
  };
}

export async function listVisibleOfferRecords(
  organizationId: Types.ObjectId,
  referenceInstant: Date,
) {
  await connectToDatabase();

  return OfferModel.find(
    buildVisibleOfferFilter(organizationId, referenceInstant),
  ).sort({ published_at: -1, _id: -1 });
}

export async function findVisibleOfferRecord(
  offerId: Types.ObjectId,
  organizationId: Types.ObjectId,
  referenceInstant: Date,
) {
  await connectToDatabase();

  return OfferModel.findOne(
    buildVisibleOfferDetailFilter(offerId, organizationId, referenceInstant),
  );
}
