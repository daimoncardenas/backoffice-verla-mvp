import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface City {
  organization_id: Types.ObjectId;
  name: string;
  normalized_name: string;
  country_code: string;
  region_code: string;
  official_code: string | null;
  is_active: boolean;
  deleted_at: Date | null;
  deleted_by: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const citySchema = new Schema<City>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    normalized_name: { type: String, required: true, trim: true },
    country_code: { type: String, required: true, trim: true },
    region_code: { type: String, required: true, trim: true },
    official_code: { type: String, default: null, trim: true },
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
    collection: "city",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

citySchema.index(
  { organization_id: 1, country_code: 1, region_code: 1, normalized_name: 1 },
  { unique: true },
);
citySchema.index(
  { organization_id: 1, country_code: 1, official_code: 1 },
  {
    unique: true,
    partialFilterExpression: { official_code: { $type: "string" } },
  },
);

export const CityModel: Model<City> =
  (models.City as Model<City> | undefined) ??
  model<City>("City", citySchema);
