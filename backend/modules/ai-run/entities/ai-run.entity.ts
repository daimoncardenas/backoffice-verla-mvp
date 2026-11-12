import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface Source {
  url: string;
  title: string | null;
  consulted_at: Date;
}

export interface AiUsage {
  input_tokens: number | null;
  output_tokens: number | null;
  image_count: number | null;
}

export interface AiRun {
  organization_id: Types.ObjectId;
  kind: "RESEARCH" | "CORRECTION" | "IMAGE";
  target_offer_id: Types.ObjectId | null;
  requested_by: Types.ObjectId;
  request_key: string;
  request_hash: string;
  status: "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED";
  research_text: string | null;
  sources: Source[];
  offer_ids: Types.ObjectId[];
  config_version: string;
  base_offer_version: number | null;
  started_at: Date;
  finished_at: Date | null;
  expires_at: Date;
  error: string | null;
  usage: AiUsage | null;
}

const sourceSchema = new Schema<Source>(
  {
    url: { type: String, required: true, trim: true, match: /^https:\/\// },
    title: { type: String, default: null, trim: true },
    consulted_at: { type: Date, required: true },
  },
  { _id: false },
);

const isNonNegativeIntegerOrNull = (value: number | null): boolean =>
  value === null || Number.isInteger(value);

const aiUsageSchema = new Schema<AiUsage>(
  {
    input_tokens: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: isNonNegativeIntegerOrNull,
        message: "input_tokens must be a non-negative integer or null",
      },
    },
    output_tokens: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: isNonNegativeIntegerOrNull,
        message: "output_tokens must be a non-negative integer or null",
      },
    },
    image_count: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: isNonNegativeIntegerOrNull,
        message: "image_count must be a non-negative integer or null",
      },
    },
  },
  { _id: false },
);

const aiRunSchema = new Schema<AiRun>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    kind: {
      type: String,
      enum: ["RESEARCH", "CORRECTION", "IMAGE"],
      required: true,
    },
    target_offer_id: {
      type: Schema.Types.ObjectId,
      ref: "Offer",
      default: null,
    },
    requested_by: {
      type: Schema.Types.ObjectId,
      ref: "UserAccount",
      required: true,
    },
    request_key: { type: String, required: true, trim: true },
    request_hash: { type: String, required: true },
    status: {
      type: String,
      enum: ["RUNNING", "SUCCEEDED", "PARTIAL", "FAILED"],
      default: "RUNNING",
      required: true,
    },
    research_text: { type: String, default: null },
    sources: { type: [sourceSchema], required: true, default: [] },
    offer_ids: {
      type: [{ type: Schema.Types.ObjectId, ref: "Offer" }],
      required: true,
      default: [],
    },
    config_version: { type: String, required: true, trim: true },
    base_offer_version: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: (value: number | null) =>
          value === null || Number.isInteger(value),
        message: "base_offer_version must be a non-negative integer or null",
      },
    },
    started_at: { type: Date, required: true },
    finished_at: { type: Date, default: null },
    expires_at: { type: Date, required: true },
    error: { type: String, default: null },
    usage: { type: aiUsageSchema, default: null },
  },
  {
    collection: "ai_run",
    timestamps: false,
    versionKey: false,
  },
);

aiRunSchema.index(
  { organization_id: 1, request_key: 1 },
  { unique: true },
);
aiRunSchema.index({ organization_id: 1, started_at: -1 });
aiRunSchema.index({ status: 1, expires_at: 1 });
aiRunSchema.index(
  { organization_id: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: "RESEARCH", status: "RUNNING" },
  },
);
aiRunSchema.index(
  { organization_id: 1, target_offer_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "RUNNING",
      target_offer_id: { $type: "objectId" },
    },
  },
);

export const AiRunModel: Model<AiRun> =
  (models.AiRun as Model<AiRun> | undefined) ??
  model<AiRun>("AiRun", aiRunSchema);
