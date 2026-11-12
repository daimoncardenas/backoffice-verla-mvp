import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface GoalRulesSnapshot {
  goal_name: string;
  activity_type_id: Types.ObjectId;
  aggregation: "COUNT";
  required_activity_status: "COMPLETED";
  offer_id: Types.ObjectId | null;
  goal_version: number;
}

export interface EmployeeGoal {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  employee_id: Types.ObjectId;
  goal_id: Types.ObjectId;
  year: number;
  month: number;
  timezone: string;
  period_start: Date;
  period_end: Date;
  target_value: number;
  status: "ACTIVE" | "CANCELLED";
  rules_snapshot: GoalRulesSnapshot;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const goalRulesSnapshotSchema = new Schema<GoalRulesSnapshot>(
  {
    goal_name: { type: String, required: true, trim: true },
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
    goal_version: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "goal_version must be an integer",
      },
    },
  },
  { _id: false },
);

const employeeGoalSchema = new Schema<EmployeeGoal>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    partner_id: { type: Schema.Types.ObjectId, ref: "Partner", required: true },
    employee_id: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    goal_id: { type: Schema.Types.ObjectId, ref: "Goal", required: true },
    year: {
      type: Number,
      required: true,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "year must be an integer",
      },
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "month must be an integer",
      },
    },
    timezone: { type: String, required: true, trim: true },
    period_start: { type: Date, required: true },
    period_end: { type: Date, required: true },
    target_value: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "target_value must be an integer",
      },
    },
    status: {
      type: String,
      enum: ["ACTIVE", "CANCELLED"],
      default: "ACTIVE",
      required: true,
    },
    rules_snapshot: { type: goalRulesSnapshotSchema, required: true },
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
    collection: "employee_goal",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

employeeGoalSchema.index(
  {
    organization_id: 1,
    partner_id: 1,
    employee_id: 1,
    goal_id: 1,
    year: 1,
    month: 1,
  },
  { unique: true },
);
employeeGoalSchema.index({ partner_id: 1, year: 1, month: 1, status: 1 });

export const EmployeeGoalModel: Model<EmployeeGoal> =
  (models.EmployeeGoal as Model<EmployeeGoal> | undefined) ??
  model<EmployeeGoal>("EmployeeGoal", employeeGoalSchema);
