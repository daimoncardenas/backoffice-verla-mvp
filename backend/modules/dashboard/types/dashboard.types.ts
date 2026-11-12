import type { HydratedDocument } from "mongoose";

import type { Offer } from "../../offer/entities/offer.entity";
import type { MetricGroup } from "../../goal-metrics/types/goal-metrics.types";

export type DashboardRole = "PARTNER" | "COORDINATOR" | "SELLER" | "EMPLOYEE";

export interface DashboardMetrics {
  scope: DashboardRole;
  year: number;
  month: number;
  timezone: string;
  period_start: Date;
  period_end: Date;
  groups?: MetricGroup[];
  own?: { groups: MetricGroup[] };
  team?: { groups: MetricGroup[] };
}

export interface DashboardPayload {
  role: DashboardRole;
  metrics?: DashboardMetrics;
  offers?: {
    latest: HydratedDocument<Offer> | null;
    other_current: HydratedDocument<Offer>[];
  };
}
