const DATE_TIME_FORMAT = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_FORMAT = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
});

const MONTH_FORMAT = new Intl.DateTimeFormat("es-CO", {
  month: "long",
  timeZone: "UTC",
});

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return DATE_TIME_FORMAT.format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return DATE_FORMAT.format(new Date(value));
}

export function formatMonth(year: number, month: number): string {
  return `${MONTH_FORMAT.format(new Date(Date.UTC(year, month - 1, 1)))} ${year}`;
}

export function toDateTimeInputValue(
  value: string | null | undefined,
): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

export function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function currentYearMonthInTimeZone(timeZone: string): {
  year: number;
  month: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  return { year, month };
}

export function isDateInYearMonth(
  value: string,
  year: number,
  month: number,
  timeZone: string,
): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(value));
  const valueYear = Number(parts.find((part) => part.type === "year")?.value);
  const valueMonth = Number(parts.find((part) => part.type === "month")?.value);

  return valueYear === year && valueMonth === month;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: "Activo",
    INACTIVE: "Inactivo",
    BLOCKED: "Bloqueado",
    COMPLETED: "Completada",
    CANCELLED: "Cancelada",
    DRAFT: "Borrador",
    PUBLISHED: "Publicada",
    ARCHIVED: "Archivada",
  };

  return labels[status] ?? status;
}

export function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    PARTNER: "Aliado",
    ORGANIZATION: "Organización",
    COORDINATOR: "Coordinador",
    SELLER: "Vendedor",
    EMPLOYEE: "Empleado",
  };

  return labels[role] ?? role;
}

export function documentTypeLabel(value: string): string {
  return value || "—";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
