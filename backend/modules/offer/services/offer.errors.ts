export class OfferNotFoundError extends Error {
  constructor() {
    super("Offer not found");
    this.name = "OfferNotFoundError";
  }
}

export class OfferValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfferValidationError";
  }
}

export class OfferConflictError extends Error {
  constructor(message = "Offer was modified") {
    super(message);
    this.name = "OfferConflictError";
  }
}
