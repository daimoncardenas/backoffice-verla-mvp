export class EmployeeGoalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeGoalValidationError";
  }
}

export class EmployeeGoalAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeGoalAccessError";
  }
}

export class EmployeeGoalNotFoundError extends Error {
  constructor() {
    super("Employee goal not found");
    this.name = "EmployeeGoalNotFoundError";
  }
}

export class EmployeeGoalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeGoalConflictError";
  }
}
