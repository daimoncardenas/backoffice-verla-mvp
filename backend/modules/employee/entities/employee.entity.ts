import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface Employee {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  employee_type_id: Types.ObjectId;
  first_name: string;
  last_name: string;
  document_type: string;
  document_number: string;
  email: string;
  phone: string;
  job_title: string;
  hired_at: Date;
  city_ids: Types.ObjectId[];
  supervisor_id: Types.ObjectId | null;
  additional_permission: Types.ObjectId[] | null;
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

const employeeSchema = new Schema<Employee>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    partner_id: { type: Schema.Types.ObjectId, ref: "Partner", required: true },
    employee_type_id: {
      type: Schema.Types.ObjectId,
      ref: "EmployeeType",
      required: true,
    },
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    document_type: { type: String, required: true, trim: true },
    document_number: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    job_title: { type: String, required: true, trim: true },
    hired_at: { type: Date, required: true },
    city_ids: {
      type: [{ type: Schema.Types.ObjectId, ref: "City" }],
      required: true,
      validate: {
        validator: (value: Types.ObjectId[]) => value.length > 0,
        message: "city_ids must contain at least one city",
      },
    },
    supervisor_id: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    additional_permission: {
      type: [{ type: Schema.Types.ObjectId, ref: "Permission" }],
      default: null,
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
    collection: "employee",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

employeeSchema.index(
  {
    organization_id: 1,
    partner_id: 1,
    document_type: 1,
    document_number: 1,
  },
  { unique: true },
);
employeeSchema.index({ partner_id: 1, supervisor_id: 1, status: 1 });
employeeSchema.index({ partner_id: 1, employee_type_id: 1, status: 1 });
employeeSchema.index({ partner_id: 1, city_ids: 1 });

export const EmployeeModel: Model<Employee> =
  (models.Employee as Model<Employee> | undefined) ??
  model<Employee>("Employee", employeeSchema);
