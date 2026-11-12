import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface ActivityType {
  organization_id: Types.ObjectId;
  code: string;
  name: string;
  description: string | null;
  requires_offer: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const activityTypeSchema = new Schema<ActivityType>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    requires_offer: { type: Boolean, required: true },
    is_active: { type: Boolean, required: true, default: true },
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
    collection: "activity_type",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

activityTypeSchema.index(
  { organization_id: 1, code: 1 },
  { unique: true },
);

export const ActivityTypeModel: Model<ActivityType> =
  (models.ActivityType as Model<ActivityType> | undefined) ??
  model<ActivityType>("ActivityType", activityTypeSchema);
