import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface AiSearchSettings {
  organization_id: Types.ObjectId;
  search_enabled: boolean;
  frequency_days: 1 | 2 | 3 | 7;
  next_run_at: Date | null;
  last_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const aiSearchSettingsSchema = new Schema<AiSearchSettings>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    search_enabled: { type: Boolean, required: true, default: false },
    frequency_days: {
      type: Number,
      enum: [1, 2, 3, 7],
      required: true,
      default: 1,
    },
    next_run_at: { type: Date, default: null },
    last_run_at: { type: Date, default: null },
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
    collection: "ai_search_settings",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

aiSearchSettingsSchema.index({ organization_id: 1 }, { unique: true });

export const AiSearchSettingsModel: Model<AiSearchSettings> =
  (models.AiSearchSettings as Model<AiSearchSettings> | undefined) ??
  model<AiSearchSettings>("AiSearchSettings", aiSearchSettingsSchema);
