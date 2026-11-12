import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface Partner {
  organization_id: Types.ObjectId;
  name: string;
  legal_name: string;
  document_type: string;
  document_number: string;
  contact_name: string;
  contact_email: string;
  phone: string;
  address: string | null;
  contract_reference: string | null;
  enabled_permission_ids: Types.ObjectId[];
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  status_reason: string | null;
  status_changed_at: Date | null;
  status_changed_by: Types.ObjectId | null;
  deleted_at: Date | null;
  deleted_by: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const partnerSchema = new Schema<Partner>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    legal_name: { type: String, required: true, trim: true },
    document_type: { type: String, required: true, trim: true },
    document_number: { type: String, required: true, trim: true },
    contact_name: { type: String, required: true, trim: true },
    contact_email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, default: null, trim: true },
    contract_reference: { type: String, default: null, trim: true },
    enabled_permission_ids: {
      type: [{ type: Schema.Types.ObjectId, ref: "Permission" }],
      required: true,
      default: [],
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "BLOCKED"],
      default: "ACTIVE",
      required: true,
    },
    status_reason: { type: String, default: null, trim: true },
    status_changed_at: { type: Date, default: null },
    status_changed_by: {
      type: Schema.Types.ObjectId,
      ref: "UserAccount",
      default: null,
    },
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
    collection: "partner",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

partnerSchema.index(
  { organization_id: 1, document_type: 1, document_number: 1 },
  { unique: true },
);
partnerSchema.index({ organization_id: 1, status: 1, created_at: 1 });

export const PartnerModel: Model<Partner> =
  (models.Partner as Model<Partner> | undefined) ??
  model<Partner>("Partner", partnerSchema);
