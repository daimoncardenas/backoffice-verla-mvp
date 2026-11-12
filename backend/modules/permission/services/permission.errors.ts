export class PermissionNotFoundError extends Error {
  constructor(message = "Permission not found") {
    super(message);
    this.name = "PermissionNotFoundError";
  }
}
