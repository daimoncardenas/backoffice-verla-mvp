import type { Types } from "mongoose";

export interface CreateGoalInput {
  code: string;
  name: string;
  description: string | null;
  activity_type_id: Types.ObjectId;
  offer_id: Types.ObjectId | null;
}

export interface UpdateGoalInput {
  expectedVersion: number;
  code?: string;
  name?: string;
  description?: string | null;
  activity_type_id?: Types.ObjectId;
  offer_id?: Types.ObjectId | null;
  is_active?: boolean;
}
