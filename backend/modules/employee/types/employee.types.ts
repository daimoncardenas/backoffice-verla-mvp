import type { Types } from "mongoose";

export interface CreateEmployeeInput {
  employee_type_id: Types.ObjectId;
  first_name: string;
  last_name: string;
  document_type: string;
  document_number: string;
  email: string;
  phone: string;
  job_title: string;
  hired_at: Date;
  city_ids: Types.ObjectId[];
  supervisor_id: Types.ObjectId | null;
  additional_permission: Types.ObjectId[] | null;
}

export interface UpdateEmployeeInput {
  expectedVersion: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  job_title?: string;
  city_ids?: Types.ObjectId[];
  additional_permission?: Types.ObjectId[] | null;
  employee_type_id?: Types.ObjectId;
  supervisor_id?: Types.ObjectId | null;
}

export interface ChangeSupervisorInput {
  expectedVersion: number;
  supervisor_id: Types.ObjectId;
}

export interface ListEmployeeFilters {
  employee_type_id?: Types.ObjectId;
  city_id?: Types.ObjectId;
  status?: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

export interface ChangeEmployeeStatusInput {
  expectedVersion: number;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  status_reason?: string | null;
}

export interface DeleteEmployeeInput {
  expectedVersion: number;
}
