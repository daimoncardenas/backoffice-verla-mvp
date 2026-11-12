export class EmployeeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeValidationError";
  }
}

export class EmployeeAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeAccessError";
  }
}

export class EmployeeNotFoundError extends Error {
  constructor(message = "Employee not found") {
    super(message);
    this.name = "EmployeeNotFoundError";
  }
}

export class EmployeeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeConflictError";
  }
}

export class EmployeePermissionNotAssignableError extends Error {
  constructor(permission: string) {
    super(`Permission is not enabled for the partner: ${permission}`);
    this.name = "EmployeePermissionNotAssignableError";
  }
}
