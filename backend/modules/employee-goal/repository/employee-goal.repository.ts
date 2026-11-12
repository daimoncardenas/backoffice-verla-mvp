import "server-only";

import type { ClientSession, QueryFilter, Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import {
  EmployeeGoalModel,
  type EmployeeGoal,
  type GoalRulesSnapshot,
} from "../entities/employee-goal.entity";

export interface NewEmployeeGoalRecord {
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
  status: "ACTIVE";
  rules_snapshot: GoalRulesSnapshot;
  created_by: Types.ObjectId;
  updated_by: Types.ObjectId;
  version: number;
}

export function buildEmployeeGoalUniqueFilter(input: {
  organizationId: Types.ObjectId;
  partnerId: Types.ObjectId;
  employeeId: Types.ObjectId;
  goalId: Types.ObjectId;
  year: number;
  month: number;
}): QueryFilter<EmployeeGoal> {
  return {
    organization_id: input.organizationId,
    partner_id: input.partnerId,
    employee_id: input.employeeId,
    goal_id: input.goalId,
    year: input.year,
    month: input.month,
  };
}

export async function listEmployeeGoalRecords(
  filter: QueryFilter<EmployeeGoal>,
) {
  await connectToDatabase();

  return EmployeeGoalModel.find(filter).sort({
    year: -1,
    month: -1,
    created_at: -1,
  });
}

export async function findEmployeeGoalRecord(
  filter: QueryFilter<EmployeeGoal>,
  session?: ClientSession,
) {
  await connectToDatabase();

  const query = EmployeeGoalModel.findOne(filter);

  return session ? query.session(session) : query;
}

export async function findEmployeeGoalByUniqueKey(
  input: {
    organizationId: Types.ObjectId;
    partnerId: Types.ObjectId;
    employeeId: Types.ObjectId;
    goalId: Types.ObjectId;
    year: number;
    month: number;
  },
  session?: ClientSession,
) {
  return findEmployeeGoalRecord(
    buildEmployeeGoalUniqueFilter(input),
    session,
  );
}

export async function createEmployeeGoalRecord(
  record: NewEmployeeGoalRecord,
  session: ClientSession,
) {
  await connectToDatabase();

  const [created] = await EmployeeGoalModel.create([record], { session });

  return created;
}

export async function updateEmployeeGoalRecord(
  filter: QueryFilter<EmployeeGoal>,
  changes: Record<string, unknown>,
  session: ClientSession,
) {
  await connectToDatabase();

  return EmployeeGoalModel.findOneAndUpdate(
    filter,
    {
      $set: changes,
      $inc: { version: 1 },
    },
    { new: true, runValidators: true, session },
  );
}
