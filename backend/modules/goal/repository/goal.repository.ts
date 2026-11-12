import "server-only";

import type { ClientSession, QueryFilter, Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { GoalModel, type Goal } from "../entities/goal.entity";

export interface NewGoalRecord {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  code: string;
  name: string;
  description: string | null;
  activity_type_id: Types.ObjectId;
  aggregation: "COUNT";
  required_activity_status: "COMPLETED";
  offer_id: Types.ObjectId | null;
  is_active: boolean;
  created_by: Types.ObjectId;
  updated_by: Types.ObjectId;
  version: number;
}

export async function listGoalRecords(
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
) {
  await connectToDatabase();

  return GoalModel.find({
    organization_id: organizationId,
    partner_id: partnerId,
    deleted_at: null,
  }).sort({ code: 1 });
}

export async function findGoalRecord(
  goalId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
) {
  await connectToDatabase();

  return GoalModel.findOne({
    _id: goalId,
    organization_id: organizationId,
    partner_id: partnerId,
    deleted_at: null,
  });
}

export async function createGoalRecord(
  record: NewGoalRecord,
  session: ClientSession,
) {
  await connectToDatabase();

  const [created] = await GoalModel.create([record], { session });

  return created;
}

export async function updateGoalRecord(
  filter: QueryFilter<Goal>,
  changes: Record<string, unknown>,
  session: ClientSession,
) {
  await connectToDatabase();

  return GoalModel.findOneAndUpdate(
    filter,
    {
      $set: changes,
      $inc: { version: 1 },
    },
    { new: true, runValidators: true, session },
  );
}

export async function softDeleteGoalRecord(
  filter: QueryFilter<Goal>,
  deletedBy: Types.ObjectId,
  session: ClientSession,
) {
  await connectToDatabase();

  return GoalModel.findOneAndUpdate(
    filter,
    {
      $set: {
        deleted_at: new Date(),
        deleted_by: deletedBy,
        updated_by: deletedBy,
      },
      $inc: { version: 1 },
    },
    { new: true, runValidators: true, session },
  );
}
