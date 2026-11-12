import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface Goal {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  code: string;
  name: string;
  description: string | null;
  activity_type_id: Types.ObjectId;
  aggregation: "COUNT";
  required_activity_status: "COMPLETED";
  offer_id: Types.ObjectId | null;
  is_active: boolean;
  deleted_at: Date | null;
  deleted_by: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const goalSchema = new Schema<Goal>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    partner_id: { type: Schema.Types.ObjectId, ref: "Partner", required: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    activity_type_id: {
      type: Schema.Types.ObjectId,
      ref: "ActivityType",
      required: true,
    },
    aggregation: {
      type: String,
      enum: ["COUNT"],
      required: true,
    },
    required_activity_status: {
      type: String,
      enum: ["COMPLETED"],
      required: true,
    },
    offer_id: { type: Schema.Types.ObjectId, ref: "Offer", default: null },
    is_active: { type: Boolean, required: true, default: true },
    deleted_at: { type: Date, default: null },
    deleted_by: { type: Schema.Types.ObjectId, ref: "UserAccount", default: null },
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
    collection: "goal",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

goalSchema.index(
  { organization_id: 1, partner_id: 1, code: 1 },
  { unique: true },
);
goalSchema.index({ partner_id: 1, is_active: 1 });

export const GoalModel: Model<Goal> =
  (models.Goal as Model<Goal> | undefined) ?? model<Goal>("Goal", goalSchema);
