import { INITIAL_SEED } from "./seed";

/**
 * Initial configuration definitions for the principal application.
 *
 * Documented catalogs and seed sets live here; the one-time organization and
 * partner identity lives in `seed.ts`. This module is pure: it reads the two
 * initial passwords from the environment and returns the seed definitions
 * without touching MongoDB. The CLI entry point decides whether the plan is
 * applied.
 */

export const ORGANIZATION_NAME = "VERLA";
export const ORGANIZATION_TIMEZONE = "America/Bogota";

export interface PermissionSeed {
  code: string;
  resource: string;
  action: string;
  name: string;
}

export interface OrganizationSeed {
  name: string;
  legal_name: string;
  tax_id: string;
  contact_email: string;
  phone: string | null;
}

export interface AccountSeed {
  email: string;
  display_name: string;
  password: string | null;
  is_service: boolean;
}

export interface PartnerSeed {
  name: string;
  legal_name: string;
  document_type: string;
  document_number: string;
  contact_name: string;
  contact_email: string;
  phone: string;
  address: string | null;
  contract_reference: string | null;
}

export interface EmployeeTypeSeed {
  code: string;
  name: string;
  permission_codes: string[];
}

export interface ActivityTypeSeed {
  code: string;
  name: string;
  requires_offer: boolean;
}

export interface CitySeed {
  name: string;
  normalized_name: string;
  country_code: string;
  region_code: string;
  official_code: string | null;
}

export interface BootstrapDefinitions {
  organization: OrganizationSeed;
  service_account: AccountSeed;
  partner: PartnerSeed;
  partner_account: AccountSeed;
  permissions: PermissionSeed[];
  partner_enabled_permission_codes: string[];
  employee_types: EmployeeTypeSeed[];
  activity_types: ActivityTypeSeed[];
  cities: CitySeed[];
}

const PERMISSION_RESOURCES: ReadonlyArray<{
  resource: string;
  actions: readonly string[];
}> = [
  {
    resource: "PARTNER",
    actions: ["LIST", "READ", "CREATE", "UPDATE", "DELETE", "ALL"],
  },
  {
    resource: "EMPLOYEE",
    actions: [
      "LIST",
      "READ",
      "CREATE",
      "UPDATE",
      "DELETE",
      "STATUS_UPDATE",
      "ASSIGN_COORDINATOR",
      "ALL",
    ],
  },
  {
    resource: "EMPLOYEE_TYPE",
    actions: ["LIST", "READ", "CREATE", "UPDATE", "DELETE", "ALL"],
  },
  {
    resource: "GOAL",
    actions: [
      "LIST",
      "READ",
      "CREATE",
      "UPDATE",
      "DELETE",
      "ASSIGN",
      "METRICS",
      "ALL",
    ],
  },
  {
    resource: "ACTIVITY",
    actions: ["LIST", "READ", "CREATE", "UPDATE", "DELETE", "ALL"],
  },
  {
    resource: "OFFER",
    actions: [
      "LIST",
      "READ",
      "CREATE",
      "UPDATE",
      "DELETE",
      "PUBLISH",
      "DISCARD",
      "ALL",
    ],
  },
  {
    resource: "CITY",
    actions: ["LIST", "READ", "CREATE", "UPDATE", "DELETE", "ALL"],
  },
  {
    resource: "ACTIVITY_TYPE",
    actions: ["LIST", "READ", "CREATE", "UPDATE", "DELETE", "ALL"],
  },
  {
    resource: "PERMISSION",
    actions: ["LIST", "READ", "CREATE", "UPDATE", "DELETE", "ASSIGN", "ALL"],
  },
  { resource: "HISTORY", actions: ["LIST", "READ", "ALL"] },
  { resource: "DASHBOARD", actions: ["READ", "ALL"] },
  { resource: "PROFILE", actions: ["READ", "UPDATE", "ALL"] },
  { resource: "AI_SEARCH_SETTINGS", actions: ["READ", "UPDATE", "ALL"] },
  { resource: "OFFER_CHAT", actions: ["LIST", "CREATE", "ALL"] },
];

export const PERMISSION_SEEDS: PermissionSeed[] = PERMISSION_RESOURCES.flatMap(
  ({ resource, actions }) =>
    actions.map((action) => ({
      code: `${resource}_${action}`,
      resource,
      action,
      name: `${resource}_${action}`,
    })),
);

export const PARTNER_ENABLED_PERMISSION_CODES: string[] = [
  "EMPLOYEE_ALL",
  "EMPLOYEE_TYPE_ALL",
  "GOAL_ALL",
  "ACTIVITY_ALL",
  "ACTIVITY_TYPE_LIST",
  "OFFER_LIST",
  "OFFER_READ",
  "CITY_LIST",
  "CITY_READ",
  "CITY_CREATE",
  "PERMISSION_LIST",
  "PERMISSION_READ",
  "PERMISSION_ASSIGN",
  "DASHBOARD_READ",
  "PROFILE_ALL",
];

export const EMPLOYEE_TYPE_SEEDS: EmployeeTypeSeed[] = [
  {
    code: "COORDINATOR",
    name: "COORDINATOR",
    permission_codes: [
      "DASHBOARD_READ",
      "EMPLOYEE_LIST",
      "EMPLOYEE_READ",
      "EMPLOYEE_CREATE",
      "EMPLOYEE_UPDATE",
      "GOAL_LIST",
      "GOAL_READ",
      "GOAL_CREATE",
      "GOAL_UPDATE",
      "GOAL_ASSIGN",
      "GOAL_METRICS",
      "ACTIVITY_ALL",
      "ACTIVITY_TYPE_LIST",
      "OFFER_LIST",
      "OFFER_READ",
      "CITY_LIST",
      "CITY_READ",
      "PROFILE_ALL",
    ],
  },
  {
    code: "SELLER",
    name: "SELLER",
    permission_codes: [
      "DASHBOARD_READ",
      "ACTIVITY_ALL",
      "ACTIVITY_TYPE_LIST",
      "GOAL_LIST",
      "GOAL_READ",
      "GOAL_METRICS",
      "OFFER_LIST",
      "OFFER_READ",
      "CITY_LIST",
      "CITY_READ",
      "PROFILE_ALL",
    ],
  },
];

export const ACTIVITY_TYPE_SEEDS: ActivityTypeSeed[] = [
  { code: "SALE", name: "SALE", requires_offer: true },
  { code: "MEETING", name: "MEETING", requires_offer: false },
  { code: "LEAD", name: "LEAD", requires_offer: false },
  { code: "CUSTOMER_SERVICE", name: "CUSTOMER_SERVICE", requires_offer: false },
];

export const CITY_SEEDS: CitySeed[] = [
  {
    name: "Bogotá",
    normalized_name: normalizeCitySeedName("Bogotá"),
    country_code: "CO",
    region_code: "DC",
    official_code: null,
  },
  {
    name: "Medellín",
    normalized_name: normalizeCitySeedName("Medellín"),
    country_code: "CO",
    region_code: "ANT",
    official_code: null,
  },
  {
    name: "Cali",
    normalized_name: normalizeCitySeedName("Cali"),
    country_code: "CO",
    region_code: "VLL",
    official_code: null,
  },
];

export const REQUIRED_ENVIRONMENT: ReadonlyArray<{
  name: string;
  purpose: string;
}> = [
  {
    name: "BOOTSTRAP_PARTNER_ACCOUNT_PASSWORD",
    purpose: "Initial partner account password (apply only)",
  },
];

export const OPTIONAL_ENVIRONMENT: ReadonlyArray<{
  name: string;
  purpose: string;
}> = [];

export class BootstrapConfigError extends Error {
  constructor(
    message: string,
    readonly missing: ReadonlyArray<{ name: string; purpose: string }> = [],
  ) {
    super(message);
    this.name = "BootstrapConfigError";
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Mirrors backend/modules/city normalizeCityName: NFD, strip diacritics,
 * lowercase, collapse whitespace. The bootstrap test asserts parity with the
 * city service so the two cannot drift.
 */
export function normalizeCitySeedName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function optionalText(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | null {
  const value = environment[name]?.trim();
  return value ? value : null;
}

function assertEmail(name: string, value: string): string {
  const email = normalizeEmail(value);

  if (!email) {
    throw new BootstrapConfigError(`${name} must be a non-empty email`);
  }

  return email;
}

function assertKnownPermissionCodes(codes: readonly string[]): void {
  const catalog = new Set(PERMISSION_SEEDS.map((permission) => permission.code));

  for (const code of codes) {
    if (!catalog.has(code)) {
      throw new BootstrapConfigError(
        `Seed permission code is not part of the catalog: ${code}`,
      );
    }
  }
}

export interface LoadDefinitionsOptions {
  require_passwords?: boolean;
}

export function loadDefinitions(
  environment: NodeJS.ProcessEnv = process.env,
  options: LoadDefinitionsOptions = {},
): BootstrapDefinitions {
  const requirePasswords = options.require_passwords ?? true;
  const missing = requirePasswords
    ? REQUIRED_ENVIRONMENT.filter((entry) => !environment[entry.name]?.trim())
    : [];

  if (missing.length > 0) {
    throw new BootstrapConfigError(
      `Missing required environment variables: ${missing
        .map((entry) => entry.name)
        .join(", ")}`,
      missing,
    );
  }

  assertKnownPermissionCodes(PARTNER_ENABLED_PERMISSION_CODES);
  for (const employeeType of EMPLOYEE_TYPE_SEEDS) {
    assertKnownPermissionCodes(employeeType.permission_codes);
  }

  const serviceAccountEmail = assertEmail(
    "seed.service_account.email",
    INITIAL_SEED.service_account.email,
  );
  const partnerAccountEmail = assertEmail(
    "seed.partner_account.email",
    INITIAL_SEED.partner_account.email,
  );

  const accountEmails = [
    serviceAccountEmail,
    partnerAccountEmail,
  ];

  if (new Set(accountEmails).size !== accountEmails.length) {
    throw new BootstrapConfigError(
      "Bootstrap account emails must be distinct",
    );
  }

  return {
    organization: {
      name: ORGANIZATION_NAME,
      legal_name: INITIAL_SEED.organization.legal_name,
      tax_id: INITIAL_SEED.organization.tax_id,
      contact_email: assertEmail(
        "seed.organization.contact_email",
        INITIAL_SEED.organization.contact_email,
      ),
      phone: INITIAL_SEED.organization.phone,
    },
    service_account: {
      email: serviceAccountEmail,
      display_name: INITIAL_SEED.service_account.display_name,
      password: null,
      is_service: true,
    },
    partner: {
      name: INITIAL_SEED.partner.name,
      legal_name: INITIAL_SEED.partner.legal_name,
      document_type: INITIAL_SEED.partner.document_type,
      document_number: INITIAL_SEED.partner.document_number,
      contact_name: INITIAL_SEED.partner.contact_name,
      contact_email: assertEmail(
        "seed.partner.contact_email",
        INITIAL_SEED.partner.contact_email,
      ),
      phone: INITIAL_SEED.partner.phone,
      address: INITIAL_SEED.partner.address,
      contract_reference: INITIAL_SEED.partner.contract_reference,
    },
    partner_account: {
      email: partnerAccountEmail,
      display_name: INITIAL_SEED.partner_account.display_name,
      password: optionalText(
        environment,
        "BOOTSTRAP_PARTNER_ACCOUNT_PASSWORD",
      ),
      is_service: false,
    },
    permissions: PERMISSION_SEEDS,
    partner_enabled_permission_codes: PARTNER_ENABLED_PERMISSION_CODES,
    employee_types: EMPLOYEE_TYPE_SEEDS,
    activity_types: ACTIVITY_TYPE_SEEDS,
    cities: CITY_SEEDS,
  };
}

export type BootstrapAccountRole =
  | "service_account"
  | "partner_account";

export interface BootstrapAccountRef {
  role: BootstrapAccountRole;
  seed: AccountSeed;
}

export function accountSeeds(
  definitions: BootstrapDefinitions,
): BootstrapAccountRef[] {
  return [
    { role: "service_account", seed: definitions.service_account },
    { role: "partner_account", seed: definitions.partner_account },
  ];
}
