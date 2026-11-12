export class GoalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalValidationError";
  }
}

export class GoalNotFoundError extends Error {
  constructor() {
    super("Goal not found");
    this.name = "GoalNotFoundError";
  }
}

export class GoalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalConflictError";
  }
}
