import "server-only";

import type {
  ClientSession,
  QueryFilter,
  Types,
} from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { EmployeeModel, type Employee } from "../entities/employee.entity";
import { EmployeeAssignmentModel } from "../../employee-assignment/entities/employee-assignment.entity";
import { UserAccountModel } from "../../user-account/entities/user-account.entity";

export interface NewEmployeeRecord {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
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
  status: "ACTIVE";
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

export interface NewAssignmentRecord {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  employee_id: Types.ObjectId;
  employee_type_id: Types.ObjectId;
  supervisor_id: Types.ObjectId | null;
  valid_from: Date;
  valid_to: null;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

export interface NewUserAccountRecord {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  employee_id: Types.ObjectId;
  account_type: "EMPLOYEE";
  display_name: string;
  email: string;
  password_hash: string;
  status: "ACTIVE";
  token_version: number;
  theme: "SYSTEM";
  is_service: false;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

export async function listEmployeeRecords(
  filter: QueryFilter<Employee>,
) {
  await connectToDatabase();

  return EmployeeModel.find(filter).sort({ created_at: -1 });
}

export async function findEmployeeRecord(
  filter: QueryFilter<Employee>,
) {
  await connectToDatabase();

  return EmployeeModel.findOne(filter);
}

export async function createEmployeeRecord(
  record: NewEmployeeRecord,
  session: ClientSession,
) {
  await connectToDatabase();

  const [created] = await EmployeeModel.create([record], { session });

  return created;
}

export async function updateEmployeeRecord(
  filter: QueryFilter<Employee>,
  changes: Record<string, unknown>,
  session: ClientSession,
) {
  await connectToDatabase();

  return EmployeeModel.findOneAndUpdate(
    filter,
    {
      $set: changes,
      $inc: { version: 1 },
    },
    { new: true, runValidators: true, session },
  );
}

export async function findCurrentAssignment(
  employeeId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
  session?: ClientSession,
) {
  await connectToDatabase();

  const query = EmployeeAssignmentModel.findOne({
    employee_id: employeeId,
    organization_id: organizationId,
    partner_id: partnerId,
    valid_to: null,
  });

  return session ? query.session(session) : query;
}

export async function listEmployeeAssignments(
  employeeId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
) {
  await connectToDatabase();

  return EmployeeAssignmentModel.find({
    employee_id: employeeId,
    organization_id: organizationId,
    partner_id: partnerId,
  }).sort({ valid_from: -1 });
}

export async function createAssignmentRecord(
  record: NewAssignmentRecord,
  session: ClientSession,
) {
  await connectToDatabase();

  const [created] = await EmployeeAssignmentModel.create([record], {
    session,
  });

  return created;
}

export async function closeAssignmentRecord(
  assignmentId: Types.ObjectId,
  validTo: Date,
  updatedBy: Types.ObjectId,
  session: ClientSession,
) {
  await connectToDatabase();

  return EmployeeAssignmentModel.findOneAndUpdate(
    {
      _id: assignmentId,
      valid_to: null,
      valid_from: { $lt: validTo },
    },
    {
      $set: {
        valid_to: validTo,
        updated_by: updatedBy,
      },
      $inc: { version: 1 },
    },
    { new: true, session },
  );
}

export async function createUserAccountRecord(
  record: NewUserAccountRecord,
  session: ClientSession,
) {
  await connectToDatabase();

  const [created] = await UserAccountModel.create([record], { session });

  return created;
}
