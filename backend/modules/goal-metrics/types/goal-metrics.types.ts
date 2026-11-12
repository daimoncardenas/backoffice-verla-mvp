import type { Types } from "mongoose";

export interface MetricRules {
  activity_type_id: Types.ObjectId;
  aggregation: "COUNT";
  required_activity_status: "COMPLETED";
  offer_id: Types.ObjectId | null;
}

export interface MetricGroup {
  goal_id: Types.ObjectId;
  goal_name: string;
  rules: MetricRules;
  target_value: number;
  actual_value: number;
  progress_percentage: number;
}

export interface EmployeeGoalMetricResult {
  employee_goal_id: Types.ObjectId;
  employee_id: Types.ObjectId;
  goal_id: Types.ObjectId;
  goal_name: string;
  year: number;
  month: number;
  period_start: Date;
  period_end: Date;
  status: "ACTIVE" | "CANCELLED";
  rules: MetricRules;
  target_value: number;
  actual_value: number;
  progress_percentage: number;
}

export interface SellerMetrics {
  scope: "SELLER";
  employee_id: Types.ObjectId;
  year: number;
  month: number;
  groups: MetricGroup[];
}

export interface CoordinatorMetrics {
  scope: "COORDINATOR";
  coordinator_id: Types.ObjectId;
  year: number;
  month: number;
  own: {
    groups: MetricGroup[];
  };
  team: {
    groups: MetricGroup[];
  };
}

export interface PartnerMetrics {
  scope: "PARTNER";
  year: number;
  month: number;
  groups: MetricGroup[];
}
