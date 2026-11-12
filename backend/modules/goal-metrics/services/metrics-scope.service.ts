import "server-only";

import type { QueryFilter, Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { EmployeeModel, type Employee } from "../../employee/entities/employee.entity";
import type { AuthContext } from "../../auth/types/auth.types";

export interface MetricsEmployeeScopeRecord {
  _id: Types.ObjectId;
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  supervisor_id: Types.ObjectId | null;
}

export function canAccessMetricsEmployee(
  context: AuthContext,
  employee: MetricsEmployeeScopeRecord,
): boolean {
  if (
    employee.organization_id.toString() !==
      context.organization_id.toString() ||
    employee.partner_id.toString() !== context.partner_id.toString()
  ) {
    return false;
  }

  if (context.account_type === "PARTNER") {
    return true;
  }

  if (!context.employee_id) {
    return false;
  }

  return (
    employee._id.equals(context.employee_id) ||
    employee.supervisor_id?.equals(context.employee_id) === true
  );
}

export function buildMetricsEmployeeScopeFilter(
  context: AuthContext,
): QueryFilter<Employee> | null {
  if (context.account_type === "PARTNER") {
    return null;
  }

  if (!context.employee_id) {
    return {
      organization_id: context.organization_id,
      partner_id: context.partner_id,
      _id: { $in: [] },
    };
  }

  return {
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    $or: [
      { _id: context.employee_id },
      { supervisor_id: context.employee_id },
    ],
  };
}

export async function loadMetricsScopeEmployeeIds(
  context: AuthContext,
): Promise<Types.ObjectId[] | null> {
  const filter = buildMetricsEmployeeScopeFilter(context);

  if (filter === null) {
    return null;
  }

  await connectToDatabase();

  const employees = await EmployeeModel.find(filter).select("_id").lean();

  return employees.map((employee) => employee._id);
}
