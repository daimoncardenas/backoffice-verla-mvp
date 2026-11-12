import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface EmployeeAssignment {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  employee_id: Types.ObjectId;
  employee_type_id: Types.ObjectId;
  supervisor_id: Types.ObjectId | null;
  valid_from: Date;
  valid_to: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const employeeAssignmentSchema = new Schema<EmployeeAssignment>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    partner_id: { type: Schema.Types.ObjectId, ref: "Partner", required: true },
    employee_id: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    employee_type_id: {
      type: Schema.Types.ObjectId,
      ref: "EmployeeType",
      required: true,
    },
    supervisor_id: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    valid_from: { type: Date, required: true },
    valid_to: { type: Date, default: null },
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
    collection: "employee_assignment",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

employeeAssignmentSchema.index(
  { organization_id: 1, partner_id: 1, employee_id: 1 },
  { unique: true, partialFilterExpression: { valid_to: null } },
);
employeeAssignmentSchema.index({
  partner_id: 1,
  employee_id: 1,
  valid_from: 1,
  valid_to: 1,
});

export const EmployeeAssignmentModel: Model<EmployeeAssignment> =
  (models.EmployeeAssignment as Model<EmployeeAssignment> | undefined) ??
  model<EmployeeAssignment>("EmployeeAssignment", employeeAssignmentSchema);
