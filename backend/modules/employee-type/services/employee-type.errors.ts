export class EmployeeTypeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeTypeValidationError";
  }
}

export class EmployeeTypeNotFoundError extends Error {
  constructor(message = "Employee type not found") {
    super(message);
    this.name = "EmployeeTypeNotFoundError";
  }
}

export class EmployeeTypeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeTypeConflictError";
  }
}

export class PermissionNotAssignableError extends Error {
  constructor(permission: string) {
    super(`Permission is not enabled for the partner: ${permission}`);
    this.name = "PermissionNotAssignableError";
  }
}
