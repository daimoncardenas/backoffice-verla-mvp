import "server-only";

import type { ClientSession, QueryFilter, Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { EmployeeModel, type Employee } from "../../employee/entities/employee.entity";
import { PartnerModel, type Partner } from "../../partner/entities/partner.entity";
import {
  UserAccountModel,
  type UserAccount,
} from "../../user-account/entities/user-account.entity";

export async function findProfileAccount(
  accountId: Types.ObjectId,
  organizationId: Types.ObjectId,
) {
  await connectToDatabase();

  return UserAccountModel.findOne({
    _id: accountId,
    organization_id: organizationId,
    deleted_at: null,
    is_service: false,
  });
}

export async function findProfilePartner(
  partnerId: Types.ObjectId,
  organizationId: Types.ObjectId,
) {
  await connectToDatabase();

  return PartnerModel.findOne({
    _id: partnerId,
    organization_id: organizationId,
    deleted_at: null,
  });
}

export async function findProfileEmployee(
  employeeId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
) {
  await connectToDatabase();

  return EmployeeModel.findOne({
    _id: employeeId,
    organization_id: organizationId,
    partner_id: partnerId,
    deleted_at: null,
  });
}

export async function updateProfileAccount(
  filter: QueryFilter<UserAccount>,
  changes: Record<string, unknown>,
  session: ClientSession,
) {
  await connectToDatabase();

  return UserAccountModel.findOneAndUpdate(
    filter,
    { $set: changes, $inc: { version: 1 } },
    { new: true, runValidators: true, session },
  );
}

export async function updateProfilePassword(
  filter: QueryFilter<UserAccount>,
  passwordHash: string,
  updatedBy: Types.ObjectId,
  session: ClientSession,
) {
  await connectToDatabase();

  return UserAccountModel.findOneAndUpdate(
    filter,
    {
      $set: {
        password_hash: passwordHash,
        updated_by: updatedBy,
      },
      $inc: {
        token_version: 1,
        version: 1,
      },
    },
    { new: true, runValidators: true, session },
  );
}

export async function updateProfilePartner(
  filter: QueryFilter<Partner>,
  changes: Record<string, unknown>,
  session: ClientSession,
) {
  await connectToDatabase();

  return PartnerModel.findOneAndUpdate(
    filter,
    { $set: changes, $inc: { version: 1 } },
    { new: true, runValidators: true, session },
  );
}

export async function updateProfileEmployee(
  filter: QueryFilter<Employee>,
  changes: Record<string, unknown>,
  session: ClientSession,
) {
  await connectToDatabase();

  return EmployeeModel.findOneAndUpdate(
    filter,
    { $set: changes, $inc: { version: 1 } },
    { new: true, runValidators: true, session },
  );
}
