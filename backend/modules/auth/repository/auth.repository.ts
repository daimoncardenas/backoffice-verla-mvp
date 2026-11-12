import "server-only";

import type { Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { EmployeeModel } from "../../employee/entities/employee.entity";
import { OrganizationModel } from "../../organization/entities/organization.entity";
import { PartnerModel } from "../../partner/entities/partner.entity";
import { UserAccountModel } from "../../user-account/entities/user-account.entity";

export async function findAccountByEmail(email: string) {
  await connectToDatabase();
  return UserAccountModel.findOne({ email });
}

export async function findAccountById(accountId: Types.ObjectId) {
  await connectToDatabase();
  return UserAccountModel.findById(accountId);
}

export async function findOrganizationById(organizationId: Types.ObjectId) {
  await connectToDatabase();
  return OrganizationModel.findById(organizationId);
}

export async function findPartnerById(
  partnerId: Types.ObjectId,
  organizationId: Types.ObjectId,
) {
  await connectToDatabase();
  return PartnerModel.findOne({
    _id: partnerId,
    organization_id: organizationId,
  });
}

export async function findEmployeeById(
  employeeId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
) {
  await connectToDatabase();
  return EmployeeModel.findOne({
    _id: employeeId,
    organization_id: organizationId,
    partner_id: partnerId,
  });
}
