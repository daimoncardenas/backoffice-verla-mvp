export type AccountType = "ORGANIZATION" | "PARTNER" | "EMPLOYEE";
export type Theme = "LIGHT" | "DARK" | "SYSTEM";

export interface SessionUser {
  id: string;
  display_name: string;
  email: string;
  account_type: AccountType;
  theme: Theme;
  organization: {
    id: string;
    name: string;
    timezone: string;
  };
  partner_id: string;
  employee_id: string | null;
  permissions: string[];
}

export interface EmployeeType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permission_ids: string[];
  is_system: boolean;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface City {
  id: string;
  name: string;
  normalized_name: string;
  country_code: string;
  region_code: string;
  official_code: string | null;
  is_active: boolean;
  version: number;
}

export interface ActivityType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  requires_offer: boolean;
}

export interface Permission {
  id: string;
  code: string;
  resource: string;
  action: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";

export interface Employee {
  id: string;
  partner_id?: string;
  employee_type_id: string;
  first_name: string;
  last_name: string;
  document_type: string;
  document_number: string;
  email: string;
  phone: string;
  job_title: string;
  hired_at: string;
  city_ids: string[];
  supervisor_id: string | null;
  additional_permission: string[] | null;
  status: EmployeeStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeAssignment {
  id: string;
  employee_type_id: string;
  supervisor_id: string | null;
  valid_from: string;
  valid_to: string | null;
  version: number;
}

export interface EmployeeDetail {
  employee: Employee;
  current_assignment: EmployeeAssignment | null;
}

export interface Goal {
  id: string;
  partner_id?: string;
  code: string;
  name: string;
  description: string | null;
  activity_type_id: string;
  aggregation: "COUNT";
  required_activity_status: "COMPLETED";
  offer_id: string | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeGoal {
  id: string;
  employee_id: string;
  goal_id: string;
  year: number;
  month: number;
  timezone: string;
  period_start: string;
  period_end: string;
  target_value: number;
  status: "ACTIVE" | "CANCELLED";
  rules_snapshot: {
    goal_name: string;
    activity_type_id: string;
    aggregation: "COUNT";
    required_activity_status: "COMPLETED";
    offer_id: string | null;
    goal_version: number;
  };
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  employee_id: string;
  activity_type_id: string;
  assignment_id: string;
  city_id: string;
  offer_id: string | null;
  offer_snapshot: {
    title: string;
    starts_at: string;
    ends_at: string;
  } | null;
  title: string;
  description: string | null;
  performed_at: string;
  status: "COMPLETED" | "CANCELLED";
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Offer {
  id: string;
  title: string;
  content: string;
  images: Array<{ url: string; alt_text: string; sort_order: number }>;
  starts_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  version?: number;
  origin?: "MANUAL" | "AI_ASSISTED";
  ai_run_id?: string | null;
  strategy_summary?: string | null;
  pending_questions?: string[];
  commercial_terms: {
    price_amount: string;
    currency: string;
    billing_period: string;
    benefits: string[];
    conditions: string[];
  } | null;
}

export interface MetricRules {
  activity_type_id: string;
  aggregation: "COUNT";
  required_activity_status: "COMPLETED";
  offer_id: string | null;
}

export interface MetricGroup {
  goal_id: string;
  goal_name: string;
  rules: MetricRules;
  target_value: number;
  actual_value: number;
  progress_percentage: number;
}

export interface DashboardMetrics {
  scope: "PARTNER" | "COORDINATOR" | "SELLER" | "EMPLOYEE";
  year: number;
  month: number;
  timezone: string;
  period_start: string;
  period_end: string;
  groups?: MetricGroup[];
  own?: { groups: MetricGroup[] };
  team?: { groups: MetricGroup[] };
}

export interface DashboardResponse {
  role: "PARTNER" | "COORDINATOR" | "SELLER" | "EMPLOYEE";
  metrics?: DashboardMetrics;
  offers?: {
    latest: Offer | null;
    other_current: Offer[];
  };
}

export interface EmployeeGoalMetric {
  employee_goal_id: string;
  employee_id: string;
  goal_id: string;
  goal_name: string;
  year: number;
  month: number;
  period_start: string;
  period_end: string;
  status: "ACTIVE" | "CANCELLED";
  rules: MetricRules;
  target_value: number;
  actual_value: number;
  progress_percentage: number;
}

export interface Partner {
  id: string;
  name: string;
  legal_name: string;
  document_type: string;
  document_number: string;
  contact_name: string;
  contact_email: string;
  phone: string;
  address: string | null;
  status: EmployeeStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProfileResponse {
  account: {
    id: string;
    account_type: AccountType;
    display_name: string;
    email: string;
    theme: Theme;
    version: number;
  };
  partner?: {
    id: string;
    name: string;
    legal_name: string;
    contact_name: string;
    contact_email: string;
    phone: string;
    address: string | null;
    version: number;
  };
  employee?: {
    id: string;
    employee_type_id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    job_title: string;
    version: number;
  };
}
