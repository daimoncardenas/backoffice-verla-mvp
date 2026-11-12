import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface OfferSnapshot {
  title: string;
  starts_at: Date;
  ends_at: Date;
}

export interface Activity {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  employee_id: Types.ObjectId;
  activity_type_id: Types.ObjectId;
  assignment_id: Types.ObjectId;
  city_id: Types.ObjectId;
  offer_id: Types.ObjectId | null;
  offer_snapshot: OfferSnapshot | null;
  title: string;
  description: string | null;
  performed_at: Date;
  status: "COMPLETED" | "CANCELLED";
  cancelled_at: Date | null;
  cancelled_by: Types.ObjectId | null;
  cancellation_reason: string | null;
  idempotency_key: string;
  creation_request_hash: string;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const offerSnapshotSchema = new Schema<OfferSnapshot>(
  {
    title: { type: String, required: true, trim: true },
    starts_at: { type: Date, required: true },
    ends_at: { type: Date, required: true },
  },
  { _id: false },
);

const activitySchema = new Schema<Activity>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    partner_id: { type: Schema.Types.ObjectId, ref: "Partner", required: true },
    employee_id: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    activity_type_id: {
      type: Schema.Types.ObjectId,
      ref: "ActivityType",
      required: true,
    },
    assignment_id: {
      type: Schema.Types.ObjectId,
      ref: "EmployeeAssignment",
      required: true,
    },
    city_id: { type: Schema.Types.ObjectId, ref: "City", required: true },
    offer_id: { type: Schema.Types.ObjectId, ref: "Offer", default: null },
    offer_snapshot: { type: offerSnapshotSchema, default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    performed_at: { type: Date, required: true },
    status: {
      type: String,
      enum: ["COMPLETED", "CANCELLED"],
      default: "COMPLETED",
      required: true,
    },
    cancelled_at: { type: Date, default: null },
    cancelled_by: {
      type: Schema.Types.ObjectId,
      ref: "UserAccount",
      default: null,
    },
    cancellation_reason: { type: String, default: null, trim: true },
    idempotency_key: { type: String, required: true, trim: true },
    creation_request_hash: { type: String, required: true, trim: true },
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
    collection: "activity",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

activitySchema.index(
  {
    organization_id: 1,
    partner_id: 1,
    employee_id: 1,
    idempotency_key: 1,
  },
  { unique: true },
);
activitySchema.index({
  partner_id: 1,
  employee_id: 1,
  activity_type_id: 1,
  status: 1,
  performed_at: 1,
});
activitySchema.index({ partner_id: 1, assignment_id: 1, performed_at: 1 });

export const ActivityModel: Model<Activity> =
  (models.Activity as Model<Activity> | undefined) ??
  model<Activity>("Activity", activitySchema);
