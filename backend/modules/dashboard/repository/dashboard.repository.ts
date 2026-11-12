import "server-only";

import type { Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { EmployeeModel } from "../../employee/entities/employee.entity";
import { EmployeeTypeModel } from "../../employee-type/entities/employee-type.entity";

export async function findDashboardEmployee(
  employeeId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
) {
  await connectToDatabase();

  return EmployeeModel.findOne({
    _id: employeeId,
    organization_id: organizationId,
    partner_id: partnerId,
  }).select("employee_type_id status deleted_at");
}

export async function findDashboardEmployeeType(
  employeeTypeId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
) {
  await connectToDatabase();

  return EmployeeTypeModel.findOne({
    _id: employeeTypeId,
    organization_id: organizationId,
    partner_id: partnerId,
  }).select("code");
}
