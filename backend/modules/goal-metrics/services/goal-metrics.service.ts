import "server-only";

import type { Types } from "mongoose";

import { assertPermission } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import type {
  Employee,
} from "../../employee/entities/employee.entity";
import type { EmployeeAssignment } from "../../employee-assignment/entities/employee-assignment.entity";
import type {
  EmployeeGoal,
  GoalRulesSnapshot,
} from "../../employee-goal/entities/employee-goal.entity";
import type { HydratedDocument } from "mongoose";
import {
  countCompletedActivities,
  findEmployeeForMetrics,
  findEmployeeGoalForMetrics,
  listActiveEmployeeGoalsForEmployee,
  listActiveEmployeeGoalsForMonth,
  listEmployeeAssignmentsInPeriod,
} from "../repository/goal-metrics.repository";
import {
  GoalMetricsAccessError,
  GoalMetricsNotFoundError,
  GoalMetricsValidationError,
} from "./goal-metrics.errors";
import {
  canAccessMetricsEmployee,
  loadMetricsScopeEmployeeIds,
} from "./metrics-scope.service";
import type {
  CoordinatorMetrics,
  EmployeeGoalMetricResult,
  MetricGroup,
  MetricRules,
  PartnerMetrics,
  SellerMetrics,
} from "../types/goal-metrics.types";

type EmployeeGoalDocument = HydratedDocument<EmployeeGoal>;
type EmployeeDocument = HydratedDocument<Employee>;

export function buildGoalRuleKey(
  goalId: Types.ObjectId,
  snapshot: GoalRulesSnapshot,
): string {
  return [
    goalId.toString(),
    snapshot.activity_type_id.toString(),
    snapshot.aggregation,
    snapshot.required_activity_status,
    snapshot.offer_id?.toString() ?? "null",
  ].join("|");
}

export function progressPercentage(
  actualValue: number,
  targetValue: number,
): number {
  if (targetValue <= 0) {
    return 0;
  }

  return (actualValue / targetValue) * 100;
}

function toMetricRules(snapshot: GoalRulesSnapshot): MetricRules {
  return {
    activity_type_id: snapshot.activity_type_id,
    aggregation: snapshot.aggregation,
    required_activity_status: snapshot.required_activity_status,
    offer_id: snapshot.offer_id,
  };
}

export function consolidateContributions(
  contributions: Array<{
    employeeGoal: EmployeeGoalDocument;
    targetValue: number;
    actualValue: number;
  }>,
): MetricGroup[] {
  const groups = new Map<
    string,
    {
      goal_id: Types.ObjectId;
      goal_name: string;
      rules: MetricRules;
      target_value: number;
      actual_value: number;
    }
  >();

  for (const contribution of contributions) {
    const snapshot = contribution.employeeGoal.rules_snapshot;
    const key = buildGoalRuleKey(
      contribution.employeeGoal.goal_id,
      snapshot,
    );
    const existing = groups.get(key);

    if (existing) {
      existing.target_value += contribution.targetValue;
      existing.actual_value += contribution.actualValue;
      continue;
    }

    groups.set(key, {
      goal_id: contribution.employeeGoal.goal_id,
      goal_name: snapshot.goal_name,
      rules: toMetricRules(snapshot),
      target_value: contribution.targetValue,
      actual_value: contribution.actualValue,
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      progress_percentage: progressPercentage(
        group.actual_value,
        group.target_value,
      ),
    }))
    .sort((left, right) => {
      const nameComparison = left.goal_name.localeCompare(right.goal_name);
      return nameComparison !== 0
        ? nameComparison
        : left.goal_id.toString().localeCompare(right.goal_id.toString());
    });
}

function overlapMilliseconds(
  intervalStart: Date,
  intervalEnd: Date,
  periodStart: Date,
  periodEnd: Date,
): number {
  const start = Math.max(intervalStart.getTime(), periodStart.getTime());
  const end = Math.min(intervalEnd.getTime(), periodEnd.getTime());

  return Math.max(end - start, 0);
}

export function calculateCoordinatorTargetShare(input: {
  targetValue: number;
  periodStart: Date;
  periodEnd: Date;
  supervisorId: Types.ObjectId;
  assignments: Array<{
    _id: Types.ObjectId;
    supervisor_id: Types.ObjectId | null;
    valid_from: Date;
    valid_to: Date | null;
  }>;
}): { targetValue: number; assignmentIds: Types.ObjectId[] } {
  const periodMilliseconds =
    input.periodEnd.getTime() - input.periodStart.getTime();

  if (periodMilliseconds <= 0) {
    return { targetValue: 0, assignmentIds: [] };
  }

  let overlapTotal = 0;
  const assignmentIds: Types.ObjectId[] = [];

  for (const assignment of input.assignments) {
    if (
      !assignment.supervisor_id ||
      !assignment.supervisor_id.equals(input.supervisorId)
    ) {
      continue;
    }

    const overlap = overlapMilliseconds(
      assignment.valid_from,
      assignment.valid_to ?? input.periodEnd,
      input.periodStart,
      input.periodEnd,
    );

    if (overlap <= 0) {
      continue;
    }

    overlapTotal += overlap;
    assignmentIds.push(assignment._id);
  }

  return {
    targetValue:
      input.targetValue * (overlapTotal / periodMilliseconds),
    assignmentIds,
  };
}

function buildIndividualResult(
  employeeGoal: EmployeeGoalDocument,
  actualValue: number,
): EmployeeGoalMetricResult {
  return {
    employee_goal_id: employeeGoal._id,
    employee_id: employeeGoal.employee_id,
    goal_id: employeeGoal.goal_id,
    goal_name: employeeGoal.rules_snapshot.goal_name,
    year: employeeGoal.year,
    month: employeeGoal.month,
    period_start: employeeGoal.period_start,
    period_end: employeeGoal.period_end,
    status: employeeGoal.status,
    rules: toMetricRules(employeeGoal.rules_snapshot),
    target_value: employeeGoal.target_value,
    actual_value: actualValue,
    progress_percentage: progressPercentage(
      actualValue,
      employeeGoal.target_value,
    ),
  };
}

function buildContributionForGoal(
  employeeGoal: EmployeeGoalDocument,
  actualValue: number,
  targetValue = employeeGoal.target_value,
) {
  return { employeeGoal, targetValue, actualValue };
}

async function countGoalActivities(
  context: AuthContext,
  employeeGoal: EmployeeGoalDocument,
  assignmentIds?: Types.ObjectId[],
): Promise<number> {
  return countCompletedActivities({
    organizationId: context.organization_id,
    partnerId: context.partner_id,
    employeeId: employeeGoal.employee_id,
    activityTypeId: employeeGoal.rules_snapshot.activity_type_id,
    offerId: employeeGoal.rules_snapshot.offer_id,
    periodStart: employeeGoal.period_start,
    periodEnd: employeeGoal.period_end,
    assignmentIds,
  });
}

async function loadEmployeeForMetrics(
  context: AuthContext,
  employeeId: Types.ObjectId,
): Promise<EmployeeDocument> {
  const employee = await findEmployeeForMetrics(
    context.organization_id,
    context.partner_id,
    employeeId,
  );

  if (!employee || !canAccessMetricsEmployee(context, employee)) {
    throw new GoalMetricsNotFoundError();
  }

  return employee;
}

async function loadScopedEmployeeGoal(
  context: AuthContext,
  employeeGoalId: Types.ObjectId,
): Promise<EmployeeGoalDocument> {
  const employeeGoal = await findEmployeeGoalForMetrics(
    employeeGoalId,
    context.organization_id,
    context.partner_id,
  );

  if (!employeeGoal) {
    throw new GoalMetricsNotFoundError();
  }

  await loadEmployeeForMetrics(context, employeeGoal.employee_id);

  return employeeGoal;
}

export async function getEmployeeGoalMetrics(
  context: AuthContext,
  employeeGoalId: Types.ObjectId,
): Promise<EmployeeGoalMetricResult> {
  await assertPermission(context, "GOAL_METRICS");

  const employeeGoal = await loadScopedEmployeeGoal(
    context,
    employeeGoalId,
  );
  const actualValue = await countGoalActivities(context, employeeGoal);

  return buildIndividualResult(employeeGoal, actualValue);
}

export async function getSellerMetrics(
  context: AuthContext,
  employeeId: Types.ObjectId,
  year: number,
  month: number,
): Promise<SellerMetrics> {
  await assertPermission(context, "GOAL_METRICS");
  validateYearMonth(year, month);
  await loadEmployeeForMetrics(context, employeeId);

  const employeeGoals = await listActiveEmployeeGoalsForEmployee(
    context.organization_id,
    context.partner_id,
    employeeId,
    year,
    month,
  );
  const contributions = [];

  for (const employeeGoal of employeeGoals) {
    contributions.push(
      buildContributionForGoal(
        employeeGoal,
        await countGoalActivities(context, employeeGoal),
      ),
    );
  }

  const groups = consolidateContributions(contributions);

  return {
    scope: "SELLER",
    employee_id: employeeId,
    year,
    month,
    groups,
  };
}

export async function getCoordinatorMetrics(
  context: AuthContext,
  coordinatorId: Types.ObjectId,
  year: number,
  month: number,
): Promise<CoordinatorMetrics> {
  await assertPermission(context, "GOAL_METRICS");
  validateYearMonth(year, month);
  await loadEmployeeForMetrics(context, coordinatorId);

  const scopeEmployeeIds = await loadMetricsScopeEmployeeIds(context);
  const employeeGoals = await listActiveEmployeeGoalsForMonth(
    context.organization_id,
    context.partner_id,
    year,
    month,
    scopeEmployeeIds ?? undefined,
  );
  const ownContributions = [];
  const teamContributions = [];

  for (const employeeGoal of employeeGoals) {
    if (employeeGoal.employee_id.equals(coordinatorId)) {
      ownContributions.push(
        buildContributionForGoal(
          employeeGoal,
          await countGoalActivities(context, employeeGoal),
        ),
      );
      continue;
    }

    const assignments = await listEmployeeAssignmentsInPeriod(
      context.organization_id,
      context.partner_id,
      employeeGoal.employee_id,
      employeeGoal.period_start,
      employeeGoal.period_end,
    );
    const share = calculateCoordinatorTargetShare({
      targetValue: employeeGoal.target_value,
      periodStart: employeeGoal.period_start,
      periodEnd: employeeGoal.period_end,
      supervisorId: coordinatorId,
      assignments,
    });

    if (share.targetValue <= 0 || share.assignmentIds.length === 0) {
      continue;
    }

    teamContributions.push(
      buildContributionForGoal(
        employeeGoal,
        await countGoalActivities(
          context,
          employeeGoal,
          share.assignmentIds,
        ),
        share.targetValue,
      ),
    );
  }

  const ownGroups = consolidateContributions(ownContributions);
  const teamGroups = consolidateContributions(teamContributions);

  return {
    scope: "COORDINATOR",
    coordinator_id: coordinatorId,
    year,
    month,
    own: {
      groups: ownGroups,
    },
    team: {
      groups: teamGroups,
    },
  };
}

export async function getPartnerMetrics(
  context: AuthContext,
  year: number,
  month: number,
): Promise<PartnerMetrics> {
  await assertPermission(context, "GOAL_METRICS");

  if (context.account_type !== "PARTNER") {
    throw new GoalMetricsAccessError(
      "Only the partner can query the partner consolidation",
    );
  }

  validateYearMonth(year, month);

  const employeeGoals = await listActiveEmployeeGoalsForMonth(
    context.organization_id,
    context.partner_id,
    year,
    month,
  );
  const contributions = [];

  for (const employeeGoal of employeeGoals) {
    contributions.push(
      buildContributionForGoal(
        employeeGoal,
        await countGoalActivities(context, employeeGoal),
      ),
    );
  }

  const groups = consolidateContributions(contributions);

  return {
    scope: "PARTNER",
    year,
    month,
    groups,
  };
}

export function validateYearMonth(year: number, month: number): void {
  if (!Number.isInteger(year)) {
    throw new GoalMetricsValidationError("year must be an integer");
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new GoalMetricsValidationError("month must be between 1 and 12");
  }
}
