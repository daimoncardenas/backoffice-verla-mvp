import "server-only";

import type { ClientSession, QueryFilter, Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { EmployeeModel } from "../../employee/entities/employee.entity";
import {
  EmployeeTypeModel,
  type EmployeeType,
} from "../entities/employee-type.entity";

export interface NewEmployeeTypeRecord {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  code: string;
  name: string;
  description: string | null;
  permission_ids: Types.ObjectId[];
  is_system: boolean;
  is_active: boolean;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

export async function listEmployeeTypeRecords(
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
) {
  await connectToDatabase();

  return EmployeeTypeModel.find({
    organization_id: organizationId,
    partner_id: partnerId,
    deleted_at: null,
  }).sort({ created_at: 1 });
}

export async function findEmployeeTypeRecord(
  employeeTypeId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
) {
  await connectToDatabase();

  return EmployeeTypeModel.findOne({
    _id: employeeTypeId,
    organization_id: organizationId,
    partner_id: partnerId,
    deleted_at: null,
  });
}

export async function createEmployeeTypeRecord(
  record: NewEmployeeTypeRecord,
  session: ClientSession,
) {
  await connectToDatabase();

  const [created] = await EmployeeTypeModel.create([record], { session });

  return created;
}

export async function updateEmployeeTypeRecord(
  filter: QueryFilter<EmployeeType>,
  changes: Record<string, unknown>,
  session: ClientSession,
) {
  await connectToDatabase();

  return EmployeeTypeModel.findOneAndUpdate(
    filter,
    {
      $set: {
        ...changes,
      },
      $inc: { version: 1 },
    },
    { new: true, runValidators: true, session },
  );
}

export async function softDeleteEmployeeTypeRecord(
  filter: QueryFilter<EmployeeType>,
  deletedBy: Types.ObjectId,
  session: ClientSession,
) {
  await connectToDatabase();

  return EmployeeTypeModel.findOneAndUpdate(
    filter,
    {
      $set: {
        deleted_at: new Date(),
        deleted_by: deletedBy,
        is_active: false,
      },
      $inc: { version: 1 },
    },
    { new: true, session },
  );
}

export async function countEmployeesForType(
  employeeTypeId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
  session: ClientSession,
) {
  await connectToDatabase();

  return EmployeeModel.countDocuments(
    {
      employee_type_id: employeeTypeId,
      organization_id: organizationId,
      partner_id: partnerId,
      deleted_at: null,
    },
    { session },
  );
}
