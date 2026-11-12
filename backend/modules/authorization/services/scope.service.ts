import "server-only";

import type { Types } from "mongoose";

import type { AuthContext } from "../../auth/types/auth.types";

export interface EmployeeScopeRecord {
  _id: Types.ObjectId;
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  supervisor_id: Types.ObjectId | null;
}

export function canAccessEmployee(
  context: AuthContext,
  employee: EmployeeScopeRecord,
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
