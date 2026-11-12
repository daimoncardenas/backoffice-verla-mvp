export class DashboardAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardAccessError";
  }
}
