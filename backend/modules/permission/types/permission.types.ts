export interface AssignablePermissionResponse {
  id: string;
  code: string;
  resource: string;
  action: string;
  name: string;
  description: string | null;
  is_active: boolean;
}
