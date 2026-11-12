export class CityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CityValidationError";
  }
}

export class CityNotFoundError extends Error {
  constructor(message = "City not found") {
    super(message);
    this.name = "CityNotFoundError";
  }
}

export class CityConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CityConflictError";
  }
}
