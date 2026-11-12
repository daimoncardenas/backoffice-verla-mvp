export class GoalMetricsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalMetricsValidationError";
  }
}

export class GoalMetricsAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalMetricsAccessError";
  }
}

export class GoalMetricsNotFoundError extends Error {
  constructor() {
    super("Employee goal metrics not found");
    this.name = "GoalMetricsNotFoundError";
  }
}
