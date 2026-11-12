import type { Types } from "mongoose";

export interface CreateEmployeeGoalInput {
  employee_id?: Types.ObjectId;
  goal_id: Types.ObjectId;
  year: number;
  month: number;
  target_value: number;
}

export interface ChangeEmployeeGoalStatusInput {
  expectedVersion: number;
}
