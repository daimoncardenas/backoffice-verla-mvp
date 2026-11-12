import type { Types } from "mongoose";

export interface CreateEmployeeTypeInput {
  code: string;
  name: string;
  description: string | null;
  permission_ids: Types.ObjectId[];
}

export interface UpdateEmployeeTypeInput {
  code?: string;
  name?: string;
  description?: string | null;
  permission_ids?: Types.ObjectId[];
  is_active?: boolean;
  expectedVersion: number;
}
