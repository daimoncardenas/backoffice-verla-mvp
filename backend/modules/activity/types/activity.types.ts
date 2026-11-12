import type { Types } from "mongoose";

export interface CreateActivityInput {
  employee_id?: Types.ObjectId;
  activity_type_id: Types.ObjectId;
  city_id: Types.ObjectId;
  offer_id: Types.ObjectId | null;
  title: string;
  description: string | null;
  performed_at: Date;
  idempotency_key: string;
}

export interface UpdateActivityInput {
  expectedVersion: number;
  title?: string;
  description?: string | null;
  city_id?: Types.ObjectId;
  offer_id?: Types.ObjectId | null;
  performed_at?: Date;
}

export interface CancelActivityInput {
  expectedVersion: number;
  reason: string;
}
