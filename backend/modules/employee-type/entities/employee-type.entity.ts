import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface EmployeeType {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  code: string;
  name: string;
  description: string | null;
  permission_ids: Types.ObjectId[];
  is_system: boolean;
  is_active: boolean;
  deleted_at: Date | null;
  deleted_by: Types.ObjectId | null;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const employeeTypeSchema = new Schema<EmployeeType>(
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
    permission_ids: {
      type: [{ type: Schema.Types.ObjectId, ref: "Permission" }],
      required: true,
      default: [],
    },
    is_system: { type: Boolean, required: true },
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
    collection: "employee_type",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

employeeTypeSchema.index(
  { organization_id: 1, partner_id: 1, code: 1 },
  { unique: true },
);

export const EmployeeTypeModel: Model<EmployeeType> =
  (models.EmployeeType as Model<EmployeeType> | undefined) ??
  model<EmployeeType>("EmployeeType", employeeTypeSchema);
