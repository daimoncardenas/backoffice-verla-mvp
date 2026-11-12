import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface Organization {
  name: string;
  legal_name: string;
  tax_id: string;
  contact_email: string;
  phone: string | null;
  timezone: string;
  status: "ACTIVE" | "INACTIVE";
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const organizationSchema = new Schema<Organization>(
  {
    name: { type: String, required: true, trim: true },
    legal_name: { type: String, required: true, trim: true },
    tax_id: { type: String, required: true, trim: true, unique: true },
    contact_email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: null, trim: true },
    timezone: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      required: true,
    },
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
    collection: "organization",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

export const OrganizationModel: Model<Organization> =
  (models.Organization as Model<Organization> | undefined) ??
  model<Organization>("Organization", organizationSchema);
