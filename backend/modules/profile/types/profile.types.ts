import type { Theme } from "../../auth/types/auth.types";

export interface UpdateProfileInput {
  expectedVersion: number;
  expectedProfileVersion?: number;
  display_name?: string;
  theme?: Theme;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  job_title?: string;
  contact_name?: string;
  contact_email?: string;
  address?: string | null;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
  expectedVersion: number;
}
