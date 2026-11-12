import type { Types } from "mongoose";

export type LoginAccountType = "ORGANIZATION" | "PARTNER" | "EMPLOYEE";
export type Theme = "LIGHT" | "DARK" | "SYSTEM";

export interface AuthContext {
  account_id: Types.ObjectId;
  display_name: string;
  email: string;
  account_type: LoginAccountType;
  theme: Theme;
  organization_id: Types.ObjectId;
  organization_name: string;
  timezone: string;
  partner_id: Types.ObjectId;
  employee_id: Types.ObjectId | null;
  supervisor_id: Types.ObjectId | null;
}

export interface SessionTokenClaims {
  sub: string;
  organization_id: string;
  token_version: number;
}
