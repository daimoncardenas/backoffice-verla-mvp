import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  GoalMetricsAccessError,
  GoalMetricsNotFoundError,
  GoalMetricsValidationError,
} from "../services/goal-metrics.errors";
import {
  getCoordinatorMetrics,
  getEmployeeGoalMetrics,
  getPartnerMetrics,
  getSellerMetrics,
} from "../services/goal-metrics.service";
import type {
  EmployeeGoalMetricResult,
  MetricGroup,
  MetricRules,
} from "../types/goal-metrics.types";

function parseObjectId(value: string, field: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new GoalMetricsValidationError(`${field} is invalid`);
  }

  return new Types.ObjectId(value);
}

function parseYearMonth(searchParams: URLSearchParams): {
  year: number;
  month: number;
} {
  const yearValue = searchParams.get("year");
  const monthValue = searchParams.get("month");

  if (yearValue === null || monthValue === null) {
    throw new GoalMetricsValidationError("year and month are required");
  }

  const year = Number(yearValue);
  const month = Number(monthValue);

  if (!Number.isInteger(year)) {
    throw new GoalMetricsValidationError("year must be an integer");
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new GoalMetricsValidationError("month must be between 1 and 12");
  }

  return { year, month };
}

function serializeRules(rules: MetricRules) {
  return {
    activity_type_id: rules.activity_type_id.toString(),
    aggregation: rules.aggregation,
    required_activity_status: rules.required_activity_status,
    offer_id: rules.offer_id?.toString() ?? null,
  };
}

function serializeGroup(group: MetricGroup) {
  return {
    goal_id: group.goal_id.toString(),
    goal_name: group.goal_name,
    rules: serializeRules(group.rules),
    target_value: group.target_value,
    actual_value: group.actual_value,
    progress_percentage: group.progress_percentage,
  };
}

function serializeEmployeeGoalMetric(result: EmployeeGoalMetricResult) {
  return {
    employee_goal_id: result.employee_goal_id.toString(),
    employee_id: result.employee_id.toString(),
    goal_id: result.goal_id.toString(),
    goal_name: result.goal_name,
    year: result.year,
    month: result.month,
    period_start: result.period_start.toISOString(),
    period_end: result.period_end.toISOString(),
    status: result.status,
    rules: serializeRules(result.rules),
    target_value: result.target_value,
    actual_value: result.actual_value,
    progress_percentage: result.progress_percentage,
  };
}

export async function handleEmployeeGoalMetrics(
  context: AuthContext,
  employeeGoalId: string,
) {
  const result = await getEmployeeGoalMetrics(
    context,
    parseObjectId(employeeGoalId, "employee goal id"),
  );

  return { metric: serializeEmployeeGoalMetric(result) };
}

export async function handleSellerMetrics(
  context: AuthContext,
  employeeId: string,
  searchParams: URLSearchParams,
) {
  const { year, month } = parseYearMonth(searchParams);
  const result = await getSellerMetrics(
    context,
    parseObjectId(employeeId, "employee id"),
    year,
    month,
  );

  return {
    scope: result.scope,
    employee_id: result.employee_id.toString(),
    year: result.year,
    month: result.month,
    groups: result.groups.map(serializeGroup),
  };
}

export async function handleCoordinatorMetrics(
  context: AuthContext,
  coordinatorId: string,
  searchParams: URLSearchParams,
) {
  const { year, month } = parseYearMonth(searchParams);
  const result = await getCoordinatorMetrics(
    context,
    parseObjectId(coordinatorId, "coordinator id"),
    year,
    month,
  );

  return {
    scope: result.scope,
    coordinator_id: result.coordinator_id.toString(),
    year: result.year,
    month: result.month,
    own: {
      groups: result.own.groups.map(serializeGroup),
    },
    team: {
      groups: result.team.groups.map(serializeGroup),
    },
  };
}

export async function handlePartnerMetrics(
  context: AuthContext,
  searchParams: URLSearchParams,
) {
  const { year, month } = parseYearMonth(searchParams);
  const result = await getPartnerMetrics(context, year, month);

  return {
    scope: result.scope,
    year: result.year,
    month: result.month,
    groups: result.groups.map(serializeGroup),
  };
}

export function goalMetricsErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof GoalMetricsAccessError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof GoalMetricsValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof GoalMetricsNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
