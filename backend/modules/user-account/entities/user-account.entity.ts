import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface UserAccount {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId | null;
  employee_id: Types.ObjectId | null;
  account_type: "ORGANIZATION" | "PARTNER" | "EMPLOYEE";
  display_name: string;
  email: string;
  password_hash: string | null;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  token_version: number;
  last_login_at: Date | null;
  theme: "LIGHT" | "DARK" | "SYSTEM";
  deleted_at: Date | null;
  deleted_by: Types.ObjectId | null;
  is_service: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const userAccountSchema = new Schema<UserAccount>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    partner_id: { type: Schema.Types.ObjectId, ref: "Partner", default: null },
    employee_id: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    account_type: {
      type: String,
      enum: ["ORGANIZATION", "PARTNER", "EMPLOYEE"],
      required: true,
    },
    display_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    password_hash: { type: String, default: null },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "BLOCKED"],
      default: "ACTIVE",
      required: true,
    },
    token_version: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "token_version must be a non-negative integer",
      },
    },
    last_login_at: { type: Date, default: null },
    theme: {
      type: String,
      enum: ["LIGHT", "DARK", "SYSTEM"],
      default: "SYSTEM",
      required: true,
    },
    deleted_at: { type: Date, default: null },
    deleted_by: { type: Schema.Types.ObjectId, ref: "UserAccount", default: null },
    is_service: { type: Boolean, required: true, default: false },
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
    collection: "user_account",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

userAccountSchema.index({ email: 1 }, { unique: true });
userAccountSchema.index(
  { organization_id: 1, employee_id: 1 },
  { unique: true, partialFilterExpression: { account_type: "EMPLOYEE" } },
);

export const UserAccountModel: Model<UserAccount> =
  (models.UserAccount as Model<UserAccount> | undefined) ??
  model<UserAccount>("UserAccount", userAccountSchema);
