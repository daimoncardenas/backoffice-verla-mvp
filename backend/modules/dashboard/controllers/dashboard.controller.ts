import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  GoalMetricsAccessError,
  GoalMetricsNotFoundError,
} from "../../goal-metrics/services/goal-metrics.errors";
import type { MetricGroup, MetricRules } from "../../goal-metrics/types/goal-metrics.types";
import { serializeOffer } from "../../offer/controllers/offer.controller";
import { getDashboard } from "../services/dashboard.service";
import { DashboardAccessError } from "../services/dashboard.errors";
import type {
  DashboardMetrics,
  DashboardPayload,
} from "../types/dashboard.types";

type DashboardOffer = NonNullable<DashboardPayload["offers"]>;

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

function serializeMetrics(metrics: DashboardMetrics) {
  const base = {
    scope: metrics.scope,
    year: metrics.year,
    month: metrics.month,
    timezone: metrics.timezone,
    period_start: metrics.period_start.toISOString(),
    period_end: metrics.period_end.toISOString(),
  };

  if (metrics.own || metrics.team) {
    return {
      ...base,
      own: {
        groups: (metrics.own?.groups ?? []).map(serializeGroup),
      },
      team: {
        groups: (metrics.team?.groups ?? []).map(serializeGroup),
      },
    };
  }

  return {
    ...base,
    groups: (metrics.groups ?? []).map(serializeGroup),
  };
}

function serializeOffers(offers: DashboardOffer) {
  return {
    latest: offers.latest ? serializeOffer(offers.latest) : null,
    other_current: offers.other_current.map(serializeOffer),
  };
}

export async function handleDashboard(context: AuthContext) {
  const dashboard = await getDashboard(context);
  const response: Record<string, unknown> = {
    role: dashboard.role,
  };

  if (dashboard.metrics) {
    response.metrics = serializeMetrics(dashboard.metrics);
  }

  if (dashboard.offers) {
    response.offers = serializeOffers(dashboard.offers);
  }

  return response;
}

export function dashboardErrorResponse(error: unknown): NextResponse {
  if (
    error instanceof ForbiddenError ||
    error instanceof DashboardAccessError ||
    error instanceof GoalMetricsAccessError
  ) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof GoalMetricsNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
