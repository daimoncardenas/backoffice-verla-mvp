const RESOURCES = [
  "AI_SEARCH_SETTINGS",
  "EMPLOYEE_TYPE",
  "ACTIVITY_TYPE",
  "OFFER_CHAT",
  "HISTORY",
  "DASHBOARD",
  "PERMISSION",
  "PROFILE",
  "PARTNER",
  "EMPLOYEE",
  "ACTIVITY",
  "OFFER",
  "GOAL",
  "CITY",
] as const;

function resourceOf(code: string): string | null {
  for (const resource of RESOURCES) {
    if (code.startsWith(`${resource}_`)) {
      return resource;
    }
  }

  return null;
}

export function hasPermission(
  permissions: readonly string[],
  code: string,
): boolean {
  if (permissions.includes(code)) {
    return true;
  }

  const resource = resourceOf(code);

  return resource !== null && permissions.includes(`${resource}_ALL`);
}

export function hasAnyPermission(
  permissions: readonly string[],
  codes: readonly string[],
): boolean {
  return codes.some((code) => hasPermission(permissions, code));
}
