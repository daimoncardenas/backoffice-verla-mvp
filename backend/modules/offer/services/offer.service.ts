import "server-only";

import mongoose, { Types, type HydratedDocument } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { assertPermission } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { recordHistoryChange } from "../../history-change/services/history.service";
import { OfferModel, type Offer } from "../entities/offer.entity";
import {
  OfferConflictError,
  OfferNotFoundError,
  OfferValidationError,
} from "./offer.errors";
import {
  findVisibleOfferRecord,
  listVisibleOfferRecords,
} from "../repository/offer.repository";

type OfferDocument = HydratedDocument<Offer>;

export async function listVisibleOffers(
  context: AuthContext,
): Promise<OfferDocument[]> {
  await assertPermission(context, "OFFER_LIST");

  const referenceInstant = new Date();

  return listVisibleOfferRecords(context.organization_id, referenceInstant);
}

export async function getVisibleOffer(
  context: AuthContext,
  offerId: Types.ObjectId,
): Promise<OfferDocument> {
  await assertPermission(context, "OFFER_READ");

  const referenceInstant = new Date();
  const offer = await findVisibleOfferRecord(
    offerId,
    context.organization_id,
    referenceInstant,
  );

  if (!offer) {
    throw new OfferNotFoundError();
  }

  return offer;
}

export async function listAllOffers(
  context: AuthContext,
): Promise<OfferDocument[]> {
  await assertPermission(context, "OFFER_LIST");

  if (context.account_type !== "ORGANIZATION") {
    throw new OfferNotFoundError();
  }

  await connectToDatabase();

  return OfferModel.find({
    organization_id: context.organization_id,
    deleted_at: null,
  }).sort({ created_at: -1 });
}

export interface CreateOfferInput {
  title: string;
  content: string;
  starts_at: Date | null;
  ends_at: Date | null;
}

export async function createOffer(
  context: AuthContext,
  input: CreateOfferInput,
  requestId: string,
): Promise<OfferDocument> {
  await assertPermission(context, "OFFER_CREATE");

  if (context.account_type !== "ORGANIZATION") {
    throw new OfferValidationError("Only the organization can create offers");
  }

  await connectToDatabase();

  const session = await mongoose.startSession();

  try {
    let createdId: Types.ObjectId | null = null;

    await session.withTransaction(async () => {
      const [created] = await OfferModel.create(
        [
          {
            organization_id: context.organization_id,
            title: input.title,
            content: input.content,
            images: [],
            starts_at: input.starts_at,
            ends_at: input.ends_at,
            status: "DRAFT",
            published_at: null,
            published_by: null,
            deleted_at: null,
            deleted_by: null,
            origin: "MANUAL",
            ai_run_id: null,
            generation_key: null,
            commercial_terms: null,
            strategy_summary: null,
            pending_questions: [],
            created_by: context.account_id,
            updated_by: context.account_id,
            version: 0,
          },
        ],
        { session },
      );

      createdId = created._id;

      await recordHistoryChange(
        session,
        {
          organization_id: context.organization_id,
          partner_id: null,
          actor_user_id: context.account_id,
          request_id: requestId,
        },
        {
          entity_name: "offer",
          record_id: created._id,
          action: "CREATE",
          previous_values: null,
          new_values: {
            title: created.title,
            content: created.content,
            starts_at: created.starts_at?.toISOString() ?? null,
            ends_at: created.ends_at?.toISOString() ?? null,
            status: created.status,
            version: created.version,
          },
        },
      );
    });

    if (!createdId) {
      throw new Error("Offer was not created");
    }

    const created = await OfferModel.findById(createdId);

    if (!created) {
      throw new Error("Offer was not created");
    }

    return created;
  } finally {
    await session.endSession();
  }
}

async function loadScopedOffer(
  context: AuthContext,
  offerId: Types.ObjectId,
): Promise<OfferDocument> {
  await connectToDatabase();

  const offer = await OfferModel.findOne({
    _id: offerId,
    organization_id: context.organization_id,
    deleted_at: null,
  });

  if (!offer) {
    throw new OfferNotFoundError();
  }

  return offer;
}

function assertPublishable(offer: OfferDocument): void {
  if (!offer.title.trim() || !offer.content.trim()) {
    throw new OfferValidationError("Title and content are required");
  }

  if (!offer.starts_at || !offer.ends_at) {
    throw new OfferValidationError("Publishing requires complete dates");
  }

  if (offer.ends_at <= offer.starts_at) {
    throw new OfferValidationError("ends_at must be after starts_at");
  }
}

export async function publishOffer(
  context: AuthContext,
  offerId: Types.ObjectId,
  expectedVersion: number | null,
  requestId: string,
): Promise<OfferDocument> {
  await assertPermission(context, "OFFER_PUBLISH");

  if (context.account_type !== "ORGANIZATION") {
    throw new OfferValidationError("Only the organization can publish offers");
  }

  const offer = await loadScopedOffer(context, offerId);

  if (offer.status !== "DRAFT") {
    throw new OfferConflictError("Only DRAFT offers can be published");
  }

  if (expectedVersion !== null && offer.version !== expectedVersion) {
    throw new OfferConflictError();
  }

  assertPublishable(offer);

  const publishedAt = new Date();
  const session = await mongoose.startSession();

  try {
    let updated: OfferDocument | null = null;

    await session.withTransaction(async () => {
      const result = await OfferModel.findOneAndUpdate(
        {
          _id: offer._id,
          organization_id: context.organization_id,
          status: "DRAFT",
          version: offer.version,
          deleted_at: null,
        },
        {
          $set: {
            status: "PUBLISHED",
            published_at: publishedAt,
            published_by: context.account_id,
            updated_by: context.account_id,
          },
          $inc: { version: 1 },
        },
        { new: true, session },
      );

      if (!result) {
        throw new OfferConflictError();
      }

      updated = result;

      await recordHistoryChange(
        session,
        {
          organization_id: context.organization_id,
          partner_id: null,
          actor_user_id: context.account_id,
          request_id: requestId,
        },
        {
          entity_name: "offer",
          record_id: result._id,
          action: "UPDATE",
          previous_values: {
            status: offer.status,
            published_at: offer.published_at?.toISOString() ?? null,
            version: offer.version,
          },
          new_values: {
            status: result.status,
            published_at: result.published_at?.toISOString() ?? null,
            version: result.version,
          },
        },
      );
    });

    if (!updated) {
      throw new OfferConflictError();
    }

    return updated;
  } finally {
    await session.endSession();
  }
}

export async function discardOffer(
  context: AuthContext,
  offerId: Types.ObjectId,
  expectedVersion: number | null,
  requestId: string,
): Promise<OfferDocument> {
  await assertPermission(context, "OFFER_DISCARD");

  if (context.account_type !== "ORGANIZATION") {
    throw new OfferValidationError("Only the organization can discard offers");
  }

  const offer = await loadScopedOffer(context, offerId);

  if (offer.status !== "DRAFT") {
    throw new OfferConflictError("Only DRAFT offers can be discarded");
  }

  if (expectedVersion !== null && offer.version !== expectedVersion) {
    throw new OfferConflictError();
  }

  const session = await mongoose.startSession();

  try {
    let updated: OfferDocument | null = null;

    await session.withTransaction(async () => {
      const result = await OfferModel.findOneAndUpdate(
        {
          _id: offer._id,
          organization_id: context.organization_id,
          status: "DRAFT",
          version: offer.version,
          deleted_at: null,
        },
        {
          $set: {
            status: "ARCHIVED",
            published_at: null,
            published_by: null,
            updated_by: context.account_id,
          },
          $inc: { version: 1 },
        },
        { new: true, session },
      );

      if (!result) {
        throw new OfferConflictError();
      }

      updated = result;

      await recordHistoryChange(
        session,
        {
          organization_id: context.organization_id,
          partner_id: null,
          actor_user_id: context.account_id,
          request_id: requestId,
        },
        {
          entity_name: "offer",
          record_id: result._id,
          action: "UPDATE",
          previous_values: {
            status: offer.status,
            version: offer.version,
          },
          new_values: {
            status: result.status,
            version: result.version,
          },
        },
      );
    });

    if (!updated) {
      throw new OfferConflictError();
    }

    return updated;
  } finally {
    await session.endSession();
  }
}
