import "server-only";

import type { Types } from "mongoose";

import {
  assertPermission,
  hasPermission,
} from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  getCoordinatorMetrics,
  getPartnerMetrics,
  getSellerMetrics,
} from "../../goal-metrics/services/goal-metrics.service";
import { calculateMonthPeriod } from "../../employee-goal/services/period.service";
import { listVisibleOffers } from "../../offer/services/offer.service";
import {
  findDashboardEmployee,
  findDashboardEmployeeType,
} from "../repository/dashboard.repository";
import { DashboardAccessError } from "./dashboard.errors";
import type {
  DashboardMetrics,
  DashboardPayload,
  DashboardRole,
} from "../types/dashboard.types";

export function currentYearMonthInTimeZone(
  timeZone: string,
  now = new Date(),
): { year: number; month: number } {
  const values = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
  };
}

async function resolveDashboardRole(
  context: AuthContext,
): Promise<DashboardRole> {
  if (context.account_type === "PARTNER") {
    return "PARTNER";
  }

  if (
    context.account_type !== "EMPLOYEE" ||
    !context.employee_id
  ) {
    throw new DashboardAccessError(
      "Dashboard identity is not available for this account",
    );
  }

  const employee = await findDashboardEmployee(
    context.employee_id,
    context.organization_id,
    context.partner_id,
  );

  if (!employee || employee.status !== "ACTIVE" || employee.deleted_at) {
    throw new DashboardAccessError("Employee is not active");
  }

  const employeeType = await findDashboardEmployeeType(
    employee.employee_type_id,
    context.organization_id,
    context.partner_id,
  );

  if (!employeeType) {
    throw new DashboardAccessError(
      "Dashboard identity is not available for this account",
    );
  }

  if (employeeType.code === "COORDINATOR") {
    return "COORDINATOR";
  }

  if (employeeType.code === "SELLER") {
    return "SELLER";
  }

  return "EMPLOYEE";
}

type MetricsRole = Exclude<DashboardRole, "EMPLOYEE">;

async function loadMetrics(
  context: AuthContext,
  role: MetricsRole,
): Promise<DashboardMetrics> {
  const { year, month } = currentYearMonthInTimeZone(context.timezone);
  const period = calculateMonthPeriod(year, month, context.timezone);
  const base = {
    scope: role,
    year,
    month,
    timezone: context.timezone,
    period_start: period.period_start,
    period_end: period.period_end,
  };

  if (role === "PARTNER") {
    const result = await getPartnerMetrics(context, year, month);

    return {
      ...base,
      groups: result.groups,
    };
  }

  if (!context.employee_id) {
    throw new DashboardAccessError("Employee identity is not available");
  }

  const employeeId: Types.ObjectId = context.employee_id;

  if (role === "COORDINATOR") {
    const result = await getCoordinatorMetrics(
      context,
      employeeId,
      year,
      month,
    );

    return {
      ...base,
      own: { groups: result.own.groups },
      team: { groups: result.team.groups },
    };
  }

  const result = await getSellerMetrics(context, employeeId, year, month);

  return {
    ...base,
    groups: result.groups,
  };
}

export async function getDashboard(
  context: AuthContext,
): Promise<DashboardPayload> {
  await assertPermission(context, "DASHBOARD_READ");

  const role = await resolveDashboardRole(context);
  const [canReadMetrics, canListOffers] = await Promise.all([
    hasPermission(context, "GOAL_METRICS"),
    hasPermission(context, "OFFER_LIST"),
  ]);

  const payload: DashboardPayload = { role };

  if (canReadMetrics && role !== "EMPLOYEE") {
    payload.metrics = await loadMetrics(context, role);
  }

  if (canListOffers) {
    const [latest = null, ...otherCurrent] = await listVisibleOffers(context);

    payload.offers = {
      latest,
      other_current: otherCurrent,
    };
  }

  return payload;
}
