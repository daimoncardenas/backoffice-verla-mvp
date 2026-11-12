import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface OfferImage {
  url: string;
  storage_key: string | null;
  alt_text: string | null;
  sort_order: number;
}

export interface CommercialTerms {
  price_amount: string | null;
  currency: string | null;
  billing_period: "MONTHLY" | "ONE_TIME" | "OTHER" | "UNKNOWN";
  benefits: string[];
  conditions: string[];
}

export interface Offer {
  organization_id: Types.ObjectId;
  title: string;
  content: string;
  images: OfferImage[];
  starts_at: Date | null;
  ends_at: Date | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  published_at: Date | null;
  published_by: Types.ObjectId | null;
  deleted_at: Date | null;
  deleted_by: Types.ObjectId | null;
  origin: "MANUAL" | "AI_ASSISTED";
  ai_run_id: Types.ObjectId | null;
  generation_key: string | null;
  commercial_terms: CommercialTerms | null;
  strategy_summary: string | null;
  pending_questions: string[];
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const offerImageSchema = new Schema<OfferImage>(
  {
    url: { type: String, required: true, trim: true, match: /^https:\/\// },
    storage_key: { type: String, default: null, trim: true },
    alt_text: { type: String, default: null, trim: true },
    sort_order: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "sort_order must be an integer",
      },
    },
  },
  { _id: false },
);

const commercialTermsSchema = new Schema<CommercialTerms>(
  {
    price_amount: { type: String, default: null, trim: true },
    currency: { type: String, default: null, trim: true },
    billing_period: {
      type: String,
      enum: ["MONTHLY", "ONE_TIME", "OTHER", "UNKNOWN"],
      required: true,
    },
    benefits: { type: [String], required: true, default: [] },
    conditions: { type: [String], required: true, default: [] },
  },
  { _id: false },
);

const offerSchema = new Schema<Offer>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    images: { type: [offerImageSchema], required: true, default: [] },
    starts_at: { type: Date, default: null },
    ends_at: { type: Date, default: null },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "DRAFT",
      required: true,
    },
    published_at: { type: Date, default: null },
    published_by: {
      type: Schema.Types.ObjectId,
      ref: "UserAccount",
      default: null,
    },
    deleted_at: { type: Date, default: null },
    deleted_by: { type: Schema.Types.ObjectId, ref: "UserAccount", default: null },
    origin: {
      type: String,
      enum: ["MANUAL", "AI_ASSISTED"],
      default: "MANUAL",
      required: true,
    },
    ai_run_id: { type: Schema.Types.ObjectId, ref: "AiRun", default: null },
    generation_key: { type: String, default: null, trim: true },
    commercial_terms: { type: commercialTermsSchema, default: null },
    strategy_summary: { type: String, default: null, trim: true },
    pending_questions: { type: [String], required: true, default: [] },
    created_by: { type: Schema.Types.ObjectId, ref: "UserAccount", default: null },
    updated_by: { type: Schema.Types.ObjectId, ref: "UserAccount", default: null },
    version: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "version must be a non-negative integer",
      },
    },
  },
  {
    collection: "offer",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

offerSchema.index({
  organization_id: 1,
  status: 1,
  starts_at: 1,
  ends_at: 1,
});
offerSchema.index({ organization_id: 1, published_at: -1 });
offerSchema.index(
  { organization_id: 1, generation_key: 1 },
  {
    unique: true,
    partialFilterExpression: { generation_key: { $type: "string" } },
  },
);

export const OfferModel: Model<Offer> =
  (models.Offer as Model<Offer> | undefined) ??
  model<Offer>("Offer", offerSchema);
