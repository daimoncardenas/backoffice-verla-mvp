"use client";

import { useApiData } from "../lib/hooks";
import { hasPermission } from "../lib/permissions";
import type { City, Employee, Permission } from "../lib/types";

export interface EmployeeTypeSummary {
  id: string;
  code: string;
  name: string;
}

export function useEmployeeLookups(permissions: readonly string[]) {
  const canListEmployeeTypes = hasPermission(permissions, "EMPLOYEE_TYPE_LIST");
  const canCreateEmployee = hasPermission(permissions, "EMPLOYEE_CREATE");
  const canAssignPermission = hasPermission(permissions, "PERMISSION_ASSIGN");

  const employeeTypesUrl = canListEmployeeTypes
    ? "/api/employee-types"
    : canCreateEmployee
      ? "/api/employee-types/assignable"
      : null;
  const employeesUrl = hasPermission(permissions, "EMPLOYEE_LIST")
    ? "/api/employees"
    : null;
  const citiesUrl = hasPermission(permissions, "CITY_LIST")
    ? "/api/cities"
    : null;
  const permissionsUrl = hasPermission(permissions, "PERMISSION_LIST")
    ? "/api/permissions"
    : null;

  const employeeTypes = useApiData<{ employee_types: EmployeeTypeSummary[] }>(
    employeeTypesUrl,
  );
  const employees = useApiData<{ employees: Employee[] }>(employeesUrl);
  const cities = useApiData<{ cities: City[] }>(citiesUrl);
  const permissionsData = useApiData<{ permissions: Permission[] }>(
    permissionsUrl,
  );

  return {
    employeeTypes: employeeTypes.data?.employee_types ?? [],
    employees: employees.data?.employees ?? [],
    cities: cities.data?.cities ?? [],
    permissions: permissionsData.data?.permissions ?? [],
    canListEmployeeTypes,
    canCreateEmployee,
    canAssignPermission,
    canAssignSupervisor: hasPermission(
      permissions,
      "EMPLOYEE_ASSIGN_COORDINATOR",
    ),
    canDeleteEmployee: hasPermission(permissions, "EMPLOYEE_DELETE"),
    canUpdateEmployee: hasPermission(permissions, "EMPLOYEE_UPDATE"),
    loading:
      employeeTypes.loading ||
      employees.loading ||
      cities.loading ||
      permissionsData.loading,
    error:
      employeeTypes.error ||
      employees.error ||
      cities.error ||
      permissionsData.error,
    reload: () => {
      employeeTypes.reload();
      employees.reload();
      cities.reload();
      permissionsData.reload();
    },
  };
}

export function employeeTypeName(
  employee: Employee,
  employeeTypes: readonly EmployeeTypeSummary[],
  sessionEmployeeId: string | null,
): string {
  const type = employeeTypes.find((item) => item.id === employee.employee_type_id);

  if (type) {
    return type.code;
  }

  if (sessionEmployeeId && employee.id === sessionEmployeeId) {
    return "COORDINATOR";
  }

  return "—";
}

export function coordinatorOptions(
  employees: readonly Employee[],
  employeeTypes: readonly EmployeeTypeSummary[],
): Employee[] {
  const coordinatorTypeIds = new Set(
    employeeTypes
      .filter((type) => type.code === "COORDINATOR")
      .map((type) => type.id),
  );

  return employees.filter(
    (employee) =>
      employee.status === "ACTIVE" &&
      coordinatorTypeIds.has(employee.employee_type_id),
  );
}
