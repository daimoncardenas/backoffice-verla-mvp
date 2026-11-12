import "server-only";

import type { QueryFilter, Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import {
  ActivityModel,
  type Activity,
} from "../../activity/entities/activity.entity";
import {
  EmployeeAssignmentModel,
  type EmployeeAssignment,
} from "../../employee-assignment/entities/employee-assignment.entity";
import { EmployeeModel, type Employee } from "../../employee/entities/employee.entity";
import {
  EmployeeGoalModel,
  type EmployeeGoal,
} from "../../employee-goal/entities/employee-goal.entity";

export interface ActivityMetricFilterInput {
  organizationId: Types.ObjectId;
  partnerId: Types.ObjectId;
  employeeId: Types.ObjectId;
  activityTypeId: Types.ObjectId;
  offerId: Types.ObjectId | null;
  periodStart: Date;
  periodEnd: Date;
  assignmentIds?: Types.ObjectId[];
}

export function buildActivityMetricFilter(
  input: ActivityMetricFilterInput,
): QueryFilter<Activity> {
  const filter: QueryFilter<Activity> = {
    organization_id: input.organizationId,
    partner_id: input.partnerId,
    employee_id: input.employeeId,
    activity_type_id: input.activityTypeId,
    status: "COMPLETED",
    performed_at: {
      $gte: input.periodStart,
      $lt: input.periodEnd,
    },
  };

  if (input.offerId) {
    filter.offer_id = input.offerId;
  }

  if (input.assignmentIds !== undefined) {
    filter.assignment_id = { $in: input.assignmentIds };
  }

  return filter;
}

export async function countCompletedActivities(
  input: ActivityMetricFilterInput,
): Promise<number> {
  if (input.assignmentIds !== undefined && input.assignmentIds.length === 0) {
    return 0;
  }

  await connectToDatabase();

  return ActivityModel.countDocuments(buildActivityMetricFilter(input));
}

export function buildAssignmentOverlapFilter(
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
  employeeId: Types.ObjectId,
  periodStart: Date,
  periodEnd: Date,
): QueryFilter<EmployeeAssignment> {
  return {
    organization_id: organizationId,
    partner_id: partnerId,
    employee_id: employeeId,
    valid_from: { $lt: periodEnd },
    $or: [{ valid_to: null }, { valid_to: { $gt: periodStart } }],
  };
}

export async function listEmployeeAssignmentsInPeriod(
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
  employeeId: Types.ObjectId,
  periodStart: Date,
  periodEnd: Date,
) {
  await connectToDatabase();

  return EmployeeAssignmentModel.find(
    buildAssignmentOverlapFilter(
      organizationId,
      partnerId,
      employeeId,
      periodStart,
      periodEnd,
    ),
  ).sort({ valid_from: 1 });
}

export async function findEmployeeForMetrics(
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
  employeeId: Types.ObjectId,
) {
  await connectToDatabase();

  return EmployeeModel.findOne({
    _id: employeeId,
    organization_id: organizationId,
    partner_id: partnerId,
  });
}

export async function findEmployeeGoalForMetrics(
  employeeGoalId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
) {
  await connectToDatabase();

  return EmployeeGoalModel.findOne({
    _id: employeeGoalId,
    organization_id: organizationId,
    partner_id: partnerId,
  });
}

export async function listActiveEmployeeGoalsForEmployee(
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
  employeeId: Types.ObjectId,
  year: number,
  month: number,
) {
  await connectToDatabase();

  return EmployeeGoalModel.find({
    organization_id: organizationId,
    partner_id: partnerId,
    employee_id: employeeId,
    year,
    month,
    status: "ACTIVE",
  }).sort({ created_at: 1 });
}

export async function listActiveEmployeeGoalsForMonth(
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
  year: number,
  month: number,
  employeeIds?: Types.ObjectId[],
) {
  await connectToDatabase();

  const filter: Record<string, unknown> = {
    organization_id: organizationId,
    partner_id: partnerId,
    year,
    month,
    status: "ACTIVE",
  };

  if (employeeIds !== undefined) {
    filter.employee_id = { $in: employeeIds };
  }

  return EmployeeGoalModel.find(filter).sort({
    employee_id: 1,
    created_at: 1,
  });
}
