import type {
  AccountSeed,
  BootstrapAccountRole,
  BootstrapDefinitions,
} from "./definitions";
import { accountSeeds } from "./definitions";

/**
 * Pure pre-flight planner. It receives read-only snapshots and decides which
 * documented records must be created, which already match, and which existing
 * records conflict with the documented seed. It never writes.
 */

export interface OrganizationSnapshot {
  id: string;
  name: string;
  legal_name: string;
  tax_id: string;
  contact_email: string;
  phone: string | null;
  timezone: string;
  status: string;
}

export interface AccountSnapshot {
  id: string;
  organization_id: string;
  partner_id: string | null;
  employee_id: string | null;
  account_type: string;
  email: string;
  password_hash: string | null;
  status: string;
  is_service: boolean;
  deleted_at: string | null;
}

export interface PermissionSnapshot {
  id: string;
  code: string;
  resource: string;
  action: string;
  is_active: boolean;
}

export interface PartnerSnapshot {
  id: string;
  name: string;
  legal_name: string;
  document_type: string;
  document_number: string;
  contact_name: string;
  contact_email: string;
  phone: string;
  address: string | null;
  contract_reference: string | null;
  status: string;
  deleted_at: string | null;
  enabled_permission_ids: string[];
}

export interface EmployeeTypeSnapshot {
  id: string;
  code: string;
  is_system: boolean;
  is_active: boolean;
  deleted_at: string | null;
  permission_ids: string[];
}

export interface ActivityTypeSnapshot {
  id: string;
  code: string;
  requires_offer: boolean;
  is_active: boolean;
}

export interface CitySnapshot {
  id: string;
  normalized_name: string;
  country_code: string;
  region_code: string;
  is_active: boolean;
  deleted_at: string | null;
}

export interface ExistingState {
  organization: OrganizationSnapshot | null;
  accounts: AccountSnapshot[];
  permissions: PermissionSnapshot[];
  partner: PartnerSnapshot | null;
  employee_types: EmployeeTypeSnapshot[];
  activity_types: ActivityTypeSnapshot[];
  cities: CitySnapshot[];
}

export interface PlanSection {
  entity: string;
  create: string[];
  skip: string[];
  conflict: string[];
}

export interface BootstrapPlan {
  sections: PlanSection[];
  conflicts: string[];
  create_count: number;
  skip_count: number;
}

/**
 * City identity inside an organization is country + region + normalized name;
 * the model allows homonymous names in different regions.
 */
export function cityKey(city: {
  country_code: string;
  region_code: string;
  normalized_name: string;
}): string {
  return `${city.country_code}:${city.region_code}:${city.normalized_name}`;
}

function issue(
  section: PlanSection,
  key: string,
  message: string,
): void {
  section.conflict.push(`${key}: ${message}`);
}

function push(
  section: PlanSection,
  key: string,
  exists: boolean,
): void {
  if (exists) {
    section.skip.push(key);
  } else {
    section.create.push(key);
  }
}

function permissionCodes(
  ids: readonly string[],
  permissionsById: Map<string, PermissionSnapshot>,
): Set<string> {
  const codes = new Set<string>();

  for (const id of ids) {
    const permission = permissionsById.get(id);

    if (permission) {
      codes.add(permission.code);
    }
  }

  return codes;
}

function missingCodes(
  granted: Set<string>,
  required: readonly string[],
): string[] {
  return required.filter((code) => !granted.has(code));
}

function planOrganization(
  definitions: BootstrapDefinitions,
  existing: ExistingState,
): PlanSection {
  const section: PlanSection = {
    entity: "organization",
    create: [],
    skip: [],
    conflict: [],
  };
  const seed = definitions.organization;
  const current = existing.organization;

  push(section, seed.tax_id, current !== null);

  if (!current) {
    return section;
  }

  if (current.name !== seed.name) {
    issue(section, seed.tax_id, "name differs from VERLA");
  }
  if (current.legal_name !== seed.legal_name) {
    issue(section, seed.tax_id, "legal_name differs from the environment");
  }
  if (current.contact_email !== seed.contact_email) {
    issue(section, seed.tax_id, "contact_email differs from the environment");
  }
  if (seed.phone !== null && current.phone !== seed.phone) {
    issue(section, seed.tax_id, "phone differs from the environment");
  }
  if (current.timezone !== "America/Bogota") {
    issue(section, seed.tax_id, "timezone is not America/Bogota");
  }
  if (current.status !== "ACTIVE") {
    issue(section, seed.tax_id, "organization is not ACTIVE");
  }

  return section;
}

function expectedAccount(
  role: BootstrapAccountRole,
  seed: AccountSeed,
  organizationId: string | null,
  partnerId: string | null,
) {
  return {
    account_type: role === "partner_account" ? "PARTNER" : "ORGANIZATION",
    partner_id: role === "partner_account" ? partnerId : null,
    employee_id: null,
    organization_id: organizationId,
    is_service: seed.is_service,
    password_required: !seed.is_service,
  };
}

function planAccounts(
  definitions: BootstrapDefinitions,
  existing: ExistingState,
): PlanSection {
  const section: PlanSection = {
    entity: "user_account",
    create: [],
    skip: [],
    conflict: [],
  };
  const byEmail = new Map(
    existing.accounts.map((account) => [account.email, account]),
  );
  const organizationId = existing.organization?.id ?? null;
  const partnerId = existing.partner?.id ?? null;

  for (const { role, seed } of accountSeeds(definitions)) {
    const current = byEmail.get(seed.email);
    push(section, seed.email, current !== undefined);

    if (!current) {
      continue;
    }

    const expected = expectedAccount(role, seed, organizationId, partnerId);

    if (!organizationId) {
      issue(section, seed.email, "account exists without its organization");
      continue;
    }

    if (current.organization_id !== organizationId) {
      issue(section, seed.email, "organization_id differs");
    }
    if (current.account_type !== expected.account_type) {
      issue(section, seed.email, "account_type differs");
    }
    if (current.is_service !== expected.is_service) {
      issue(section, seed.email, "is_service differs");
    }
    if (current.employee_id !== null) {
      issue(section, seed.email, "employee_id must be null");
    }
    if (current.partner_id !== expected.partner_id) {
      issue(
        section,
        seed.email,
        role === "partner_account"
          ? "partner_id differs or the partner does not exist"
          : "partner_id must be null",
      );
    }
    if (current.status !== "ACTIVE") {
      issue(section, seed.email, "account is not ACTIVE");
    }
    if (current.deleted_at !== null) {
      issue(section, seed.email, "account is logically deleted");
    }
    if (expected.password_required && !current.password_hash) {
      issue(section, seed.email, "human account has no password hash");
    }
    if (!expected.password_required && current.password_hash !== null) {
      issue(section, seed.email, "service account has a password hash");
    }
  }

  return section;
}

function planPermissions(
  definitions: BootstrapDefinitions,
  existing: ExistingState,
): PlanSection {
  const section: PlanSection = {
    entity: "permission",
    create: [],
    skip: [],
    conflict: [],
  };
  const byCode = new Map(
    existing.permissions.map((permission) => [permission.code, permission]),
  );

  for (const seed of definitions.permissions) {
    const current = byCode.get(seed.code);
    push(section, seed.code, current !== undefined);

    if (!current) {
      continue;
    }

    if (current.resource !== seed.resource) {
      issue(section, seed.code, "resource differs");
    }
    if (current.action !== seed.action) {
      issue(section, seed.code, "action differs");
    }
    if (!current.is_active) {
      issue(section, seed.code, "permission is inactive");
    }
  }

  return section;
}

function planPartner(
  definitions: BootstrapDefinitions,
  existing: ExistingState,
): PlanSection {
  const section: PlanSection = {
    entity: "partner",
    create: [],
    skip: [],
    conflict: [],
  };
  const seed = definitions.partner;
  const key = `${seed.document_type}:${seed.document_number}`;
  const current = existing.partner;

  push(section, key, current !== null);

  if (!current) {
    return section;
  }

  if (current.name !== seed.name) {
    issue(section, key, "name differs from the environment");
  }
  if (current.legal_name !== seed.legal_name) {
    issue(section, key, "legal_name differs from the environment");
  }
  if (current.contact_name !== seed.contact_name) {
    issue(section, key, "contact_name differs from the environment");
  }
  if (current.contact_email !== seed.contact_email) {
    issue(section, key, "contact_email differs from the environment");
  }
  if (current.phone !== seed.phone) {
    issue(section, key, "phone differs from the environment");
  }
  if (seed.address !== null && current.address !== seed.address) {
    issue(section, key, "address differs from the environment");
  }
  if (
    seed.contract_reference !== null &&
    current.contract_reference !== seed.contract_reference
  ) {
    issue(section, key, "contract_reference differs from the environment");
  }
  if (current.status !== "ACTIVE") {
    issue(section, key, "partner is not ACTIVE");
  }
  if (current.deleted_at !== null) {
    issue(section, key, "partner is logically deleted");
  }

  const permissionsById = new Map(
    existing.permissions.map((permission) => [permission.id, permission]),
  );
  const granted = permissionCodes(
    current.enabled_permission_ids,
    permissionsById,
  );
  const missing = missingCodes(
    granted,
    definitions.partner_enabled_permission_codes,
  );

  if (missing.length > 0) {
    issue(
      section,
      key,
      `enabled_permission_ids is missing ${missing.join(", ")}`,
    );
  }

  return section;
}

function planEmployeeTypes(
  definitions: BootstrapDefinitions,
  existing: ExistingState,
): PlanSection {
  const section: PlanSection = {
    entity: "employee_type",
    create: [],
    skip: [],
    conflict: [],
  };
  const byCode = new Map(
    existing.employee_types.map((employeeType) => [
      employeeType.code,
      employeeType,
    ]),
  );
  const permissionsById = new Map(
    existing.permissions.map((permission) => [permission.id, permission]),
  );

  for (const seed of definitions.employee_types) {
    const current = byCode.get(seed.code);
    push(section, seed.code, current !== undefined);

    if (!current) {
      continue;
    }

    if (!current.is_system) {
      issue(section, seed.code, "is_system must be true");
    }
    if (!current.is_active) {
      issue(section, seed.code, "employee type is inactive");
    }
    if (current.deleted_at !== null) {
      issue(section, seed.code, "employee type is logically deleted");
    }

    const granted = permissionCodes(current.permission_ids, permissionsById);
    const missing = missingCodes(granted, seed.permission_codes);

    if (missing.length > 0) {
      issue(
        section,
        seed.code,
        `permission_ids is missing ${missing.join(", ")}`,
      );
    }
  }

  return section;
}

function planActivityTypes(
  definitions: BootstrapDefinitions,
  existing: ExistingState,
): PlanSection {
  const section: PlanSection = {
    entity: "activity_type",
    create: [],
    skip: [],
    conflict: [],
  };
  const byCode = new Map(
    existing.activity_types.map((activityType) => [
      activityType.code,
      activityType,
    ]),
  );

  for (const seed of definitions.activity_types) {
    const current = byCode.get(seed.code);
    push(section, seed.code, current !== undefined);

    if (!current) {
      continue;
    }

    if (current.requires_offer !== seed.requires_offer) {
      issue(
        section,
        seed.code,
        `requires_offer must be ${seed.requires_offer}`,
      );
    }
    if (!current.is_active) {
      issue(section, seed.code, "activity type is inactive");
    }
  }

  return section;
}

function planCities(
  definitions: BootstrapDefinitions,
  existing: ExistingState,
): PlanSection {
  const section: PlanSection = {
    entity: "city",
    create: [],
    skip: [],
    conflict: [],
  };
  const byKey = new Map(
    existing.cities.map((city) => [cityKey(city), city]),
  );

  for (const seed of definitions.cities) {
    const key = cityKey(seed);
    const current = byKey.get(key);
    push(section, key, current !== undefined);

    if (!current) {
      continue;
    }

    if (current.country_code !== seed.country_code) {
      issue(section, key, "country_code differs");
    }
    if (current.region_code !== seed.region_code) {
      issue(section, key, "region_code differs");
    }
    if (!current.is_active) {
      issue(section, key, "city is inactive");
    }
    if (current.deleted_at !== null) {
      issue(section, key, "city is logically deleted");
    }
  }

  return section;
}

export function planBootstrap(
  definitions: BootstrapDefinitions,
  existing: ExistingState,
): BootstrapPlan {
  const sections = [
    planOrganization(definitions, existing),
    planAccounts(definitions, existing),
    planPermissions(definitions, existing),
    planPartner(definitions, existing),
    planEmployeeTypes(definitions, existing),
    planActivityTypes(definitions, existing),
    planCities(definitions, existing),
  ];
  const conflicts = sections.flatMap((section) =>
    section.conflict.map((conflict) => `${section.entity}:${conflict}`),
  );

  return {
    sections,
    conflicts,
    create_count: sections.reduce(
      (total, section) => total + section.create.length,
      0,
    ),
    skip_count: sections.reduce(
      (total, section) => total + section.skip.length,
      0,
    ),
  };
}

export function collectCreateKeys(plan: BootstrapPlan): Map<string, string[]> {
  return new Map(
    plan.sections.map((section) => [section.entity, [...section.create]]),
  );
}
