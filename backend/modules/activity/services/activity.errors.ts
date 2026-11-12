export class ActivityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityValidationError";
  }
}

export class ActivityAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityAccessError";
  }
}

export class ActivityNotFoundError extends Error {
  constructor() {
    super("Activity not found");
    this.name = "ActivityNotFoundError";
  }
}

export class ActivityConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityConflictError";
  }
}
