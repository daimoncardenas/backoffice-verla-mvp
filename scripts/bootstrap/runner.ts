import mongoose, {
  Types,
  type ClientSession,
  type HydratedDocument,
  type Model,
} from "mongoose";

import { hashPassword } from "../../backend/modules/auth/services/password.service";
import { ActivityTypeModel } from "../../backend/modules/activity-type/entities/activity-type.entity";
import { CityModel } from "../../backend/modules/city/entities/city.entity";
import { EmployeeTypeModel } from "../../backend/modules/employee-type/entities/employee-type.entity";
import {
  recordHistoryChange,
  type AuditContext,
} from "../../backend/modules/history-change/services/history.service";
import type { HistoryEntityName } from "../../backend/modules/history-change/entities/history-change.entity";
import { OrganizationModel } from "../../backend/modules/organization/entities/organization.entity";
import { PartnerModel } from "../../backend/modules/partner/entities/partner.entity";
import { PermissionModel } from "../../backend/modules/permission/entities/permission.entity";
import { UserAccountModel } from "../../backend/modules/user-account/entities/user-account.entity";
import type {
  AccountSeed,
  BootstrapDefinitions,
} from "./definitions";
import { accountSeeds } from "./definitions";
import type {
  AccountSnapshot,
  ActivityTypeSnapshot,
  CitySnapshot,
  EmployeeTypeSnapshot,
  ExistingState,
  OrganizationSnapshot,
  PartnerSnapshot,
  PermissionSnapshot,
} from "./planner";
import { cityKey } from "./planner";

/**
 * Read-only snapshot loading and the transactional application of the
 * bootstrap plan. The entry point connects before calling these functions and
 * disables autoCreate/autoIndex before any model or connection is initialized.
 */

interface RunIds {
  organization: Types.ObjectId;
  accounts: Map<string, Types.ObjectId>;
  permissions: Map<string, Types.ObjectId>;
  partner: Types.ObjectId;
  employee_types: Map<string, Types.ObjectId>;
  activity_types: Map<string, Types.ObjectId>;
  cities: Map<string, Types.ObjectId>;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export async function readExistingState(
  definitions: BootstrapDefinitions,
): Promise<ExistingState> {
  const organization = await OrganizationModel.findOne({
    tax_id: definitions.organization.tax_id,
  }).lean();
  const organizationId = organization?._id ?? null;
  const emails = accountSeeds(definitions).map(
    (account) => account.seed.email,
  );
  const accounts = await UserAccountModel.find({
    email: { $in: emails },
  }).lean();
  const permissions = organizationId
    ? await PermissionModel.find({ organization_id: organizationId }).lean()
    : [];
  const partner =
    organizationId === null
      ? null
      : await PartnerModel.findOne({
          organization_id: organizationId,
          document_type: definitions.partner.document_type,
          document_number: definitions.partner.document_number,
        }).lean();
  const employeeTypes =
    organizationId === null || partner === null
      ? []
      : await EmployeeTypeModel.find({
          organization_id: organizationId,
          partner_id: partner._id,
          code: {
            $in: definitions.employee_types.map((seed) => seed.code),
          },
        }).lean();
  const activityTypes =
    organizationId === null
      ? []
      : await ActivityTypeModel.find({
          organization_id: organizationId,
          code: {
            $in: definitions.activity_types.map((seed) => seed.code),
          },
        }).lean();
  const cities =
    organizationId === null
      ? []
      : await CityModel.find({
          organization_id: organizationId,
          $or: definitions.cities.map((seed) => ({
            country_code: seed.country_code,
            region_code: seed.region_code,
            normalized_name: seed.normalized_name,
          })),
        }).lean();

  return {
    organization: organization
      ? ({
          id: organization._id.toString(),
          name: organization.name,
          legal_name: organization.legal_name,
          tax_id: organization.tax_id,
          contact_email: organization.contact_email,
          phone: organization.phone,
          timezone: organization.timezone,
          status: organization.status,
        } satisfies OrganizationSnapshot)
      : null,
    accounts: accounts.map(
      (account): AccountSnapshot => ({
        id: account._id.toString(),
        organization_id: account.organization_id.toString(),
        partner_id: account.partner_id?.toString() ?? null,
        employee_id: account.employee_id?.toString() ?? null,
        account_type: account.account_type,
        email: account.email,
        password_hash: account.password_hash,
        status: account.status,
        is_service: account.is_service,
        deleted_at: toIso(account.deleted_at),
      }),
    ),
    permissions: permissions.map(
      (permission): PermissionSnapshot => ({
        id: permission._id.toString(),
        code: permission.code,
        resource: permission.resource,
        action: permission.action,
        is_active: permission.is_active,
      }),
    ),
    partner: partner
      ? ({
          id: partner._id.toString(),
          name: partner.name,
          legal_name: partner.legal_name,
          document_type: partner.document_type,
          document_number: partner.document_number,
          contact_name: partner.contact_name,
          contact_email: partner.contact_email,
          phone: partner.phone,
          address: partner.address,
          contract_reference: partner.contract_reference,
          status: partner.status,
          deleted_at: toIso(partner.deleted_at),
          enabled_permission_ids: partner.enabled_permission_ids.map((id) =>
            id.toString(),
          ),
        } satisfies PartnerSnapshot)
      : null,
    employee_types: employeeTypes.map(
      (employeeType): EmployeeTypeSnapshot => ({
        id: employeeType._id.toString(),
        code: employeeType.code,
        is_system: employeeType.is_system,
        is_active: employeeType.is_active,
        deleted_at: toIso(employeeType.deleted_at),
        permission_ids: employeeType.permission_ids.map((id) =>
          id.toString(),
        ),
      }),
    ),
    activity_types: activityTypes.map(
      (activityType): ActivityTypeSnapshot => ({
        id: activityType._id.toString(),
        code: activityType.code,
        requires_offer: activityType.requires_offer,
        is_active: activityType.is_active,
      }),
    ),
    cities: cities.map(
      (city): CitySnapshot => ({
        id: city._id.toString(),
        normalized_name: city.normalized_name,
        country_code: city.country_code,
        region_code: city.region_code,
        is_active: city.is_active,
        deleted_at: toIso(city.deleted_at),
      }),
    ),
  };
}

function buildIds(
  definitions: BootstrapDefinitions,
  existing: ExistingState,
): RunIds {
  const accounts = new Map(
    existing.accounts.map((account) => [
      account.email,
      new Types.ObjectId(account.id),
    ]),
  );

  for (const { seed } of accountSeeds(definitions)) {
    if (!accounts.has(seed.email)) {
      accounts.set(seed.email, new Types.ObjectId());
    }
  }

  const permissions = new Map(
    existing.permissions.map((permission) => [
      permission.code,
      new Types.ObjectId(permission.id),
    ]),
  );

  for (const permission of definitions.permissions) {
    if (!permissions.has(permission.code)) {
      permissions.set(permission.code, new Types.ObjectId());
    }
  }

  const employeeTypes = new Map(
    existing.employee_types.map((employeeType) => [
      employeeType.code,
      new Types.ObjectId(employeeType.id),
    ]),
  );

  for (const employeeType of definitions.employee_types) {
    if (!employeeTypes.has(employeeType.code)) {
      employeeTypes.set(employeeType.code, new Types.ObjectId());
    }
  }

  const activityTypes = new Map(
    existing.activity_types.map((activityType) => [
      activityType.code,
      new Types.ObjectId(activityType.id),
    ]),
  );

  for (const activityType of definitions.activity_types) {
    if (!activityTypes.has(activityType.code)) {
      activityTypes.set(activityType.code, new Types.ObjectId());
    }
  }

  const cities = new Map(
    existing.cities.map((city) => [
      cityKey(city),
      new Types.ObjectId(city.id),
    ]),
  );

  for (const city of definitions.cities) {
    const key = cityKey(city);

    if (!cities.has(key)) {
      cities.set(key, new Types.ObjectId());
    }
  }

  return {
    organization: existing.organization
      ? new Types.ObjectId(existing.organization.id)
      : new Types.ObjectId(),
    accounts,
    permissions,
    partner: existing.partner
      ? new Types.ObjectId(existing.partner.id)
      : new Types.ObjectId(),
    employee_types: employeeTypes,
    activity_types: activityTypes,
    cities,
  };
}

async function createAudited<T>(
  session: ClientSession,
  model: Model<T>,
  record: Record<string, unknown>,
  entity: HistoryEntityName,
  context: AuditContext,
  snapshot: Record<string, unknown>,
): Promise<Types.ObjectId> {
  const [document] = await (model as Model<any>).create([record], {
    session,
  });
  const id = (document as HydratedDocument<T>)._id as Types.ObjectId;

  await recordHistoryChange(session, context, {
    entity_name: entity,
    record_id: id,
    action: "CREATE",
    previous_values: null,
    new_values: snapshot,
  });

  return id;
}

function accountSnapshot(
  seed: AccountSeed,
  accountType: "ORGANIZATION" | "PARTNER",
  partnerId: string | null,
): Record<string, unknown> {
  return {
    email: seed.email,
    display_name: seed.display_name,
    account_type: accountType,
    partner_id: partnerId,
    employee_id: null,
    status: "ACTIVE",
    token_version: 0,
    theme: "SYSTEM",
    is_service: seed.is_service,
  };
}

function resolvePermissionIds(
  codes: readonly string[],
  permissions: Map<string, Types.ObjectId>,
): Types.ObjectId[] {
  return codes.map((code) => {
    const permissionId = permissions.get(code);

    if (!permissionId) {
      throw new Error(`Permission id was not generated: ${code}`);
    }

    return permissionId;
  });
}

async function createAll(
  session: ClientSession,
  definitions: BootstrapDefinitions,
  existing: ExistingState,
  ids: RunIds,
  passwordHashes: Map<string, string>,
  requestId: string,
): Promise<number> {
  const actorId = ids.accounts.get(definitions.service_account.email);

  if (!actorId) {
    throw new Error("Service account id was not generated");
  }

  const auditFor = (partnerId: Types.ObjectId | null): AuditContext => ({
    organization_id: ids.organization,
    partner_id: partnerId,
    actor_user_id: actorId,
    request_id: requestId,
    reason: null,
  });

  let created = 0;

  if (!existing.accounts.some((a) => a.email === definitions.service_account.email)) {
    await createAudited(
      session,
      UserAccountModel,
      {
        _id: actorId,
        organization_id: ids.organization,
        partner_id: null,
        employee_id: null,
        account_type: "ORGANIZATION",
        display_name: definitions.service_account.display_name,
        email: definitions.service_account.email,
        password_hash: null,
        status: "ACTIVE",
        token_version: 0,
        last_login_at: null,
        theme: "SYSTEM",
        deleted_at: null,
        deleted_by: null,
        is_service: true,
        created_by: null,
        updated_by: null,
      },
      "user_account",
      auditFor(null),
      accountSnapshot(
        definitions.service_account,
        "ORGANIZATION",
        null,
      ),
    );
    created += 1;
  }

  if (!existing.organization) {
    await createAudited(
      session,
      OrganizationModel,
      {
        _id: ids.organization,
        name: definitions.organization.name,
        legal_name: definitions.organization.legal_name,
        tax_id: definitions.organization.tax_id,
        contact_email: definitions.organization.contact_email,
        phone: definitions.organization.phone,
        timezone: "America/Bogota",
        status: "ACTIVE",
        created_by: actorId,
        updated_by: actorId,
      },
      "organization",
      auditFor(null),
      {
        name: definitions.organization.name,
        legal_name: definitions.organization.legal_name,
        tax_id: definitions.organization.tax_id,
        contact_email: definitions.organization.contact_email,
        phone: definitions.organization.phone,
        timezone: "America/Bogota",
        status: "ACTIVE",
      },
    );
    created += 1;
  }

  for (const seed of definitions.permissions) {
    if (existing.permissions.some((p) => p.code === seed.code)) {
      continue;
    }

    await createAudited(
      session,
      PermissionModel,
      {
        _id: ids.permissions.get(seed.code),
        organization_id: ids.organization,
        code: seed.code,
        resource: seed.resource,
        action: seed.action,
        name: seed.name,
        description: null,
        is_active: true,
        created_by: actorId,
        updated_by: actorId,
      },
      "permission",
      auditFor(null),
      {
        code: seed.code,
        resource: seed.resource,
        action: seed.action,
        name: seed.name,
        description: null,
        is_active: true,
      },
    );
    created += 1;
  }

  if (!existing.partner) {
    const enabledPermissionIds = resolvePermissionIds(
      definitions.partner_enabled_permission_codes,
      ids.permissions,
    );

    await createAudited(
      session,
      PartnerModel,
      {
        _id: ids.partner,
        organization_id: ids.organization,
        name: definitions.partner.name,
        legal_name: definitions.partner.legal_name,
        document_type: definitions.partner.document_type,
        document_number: definitions.partner.document_number,
        contact_name: definitions.partner.contact_name,
        contact_email: definitions.partner.contact_email,
        phone: definitions.partner.phone,
        address: definitions.partner.address,
        contract_reference: definitions.partner.contract_reference,
        enabled_permission_ids: enabledPermissionIds,
        status: "ACTIVE",
        status_reason: null,
        status_changed_at: null,
        status_changed_by: null,
        deleted_at: null,
        deleted_by: null,
        created_by: actorId,
        updated_by: actorId,
      },
      "partner",
      auditFor(ids.partner),
      {
        name: definitions.partner.name,
        legal_name: definitions.partner.legal_name,
        document_type: definitions.partner.document_type,
        document_number: definitions.partner.document_number,
        contact_name: definitions.partner.contact_name,
        contact_email: definitions.partner.contact_email,
        phone: definitions.partner.phone,
        address: definitions.partner.address,
        contract_reference: definitions.partner.contract_reference,
        status: "ACTIVE",
        enabled_permission_ids: enabledPermissionIds.map((permissionId) =>
          permissionId.toString(),
        ),
      },
    );
    created += 1;
  }

  const partnerAccount = definitions.partner_account;
  if (!existing.accounts.some((a) => a.email === partnerAccount.email)) {
    const passwordHash = passwordHashes.get(partnerAccount.email);

    if (!passwordHash) {
      throw new Error("Partner account password hash is missing");
    }

    await createAudited(
      session,
      UserAccountModel,
      {
        _id: ids.accounts.get(partnerAccount.email),
        organization_id: ids.organization,
        partner_id: ids.partner,
        employee_id: null,
        account_type: "PARTNER",
        display_name: partnerAccount.display_name,
        email: partnerAccount.email,
        password_hash: passwordHash,
        status: "ACTIVE",
        token_version: 0,
        last_login_at: null,
        theme: "SYSTEM",
        deleted_at: null,
        deleted_by: null,
        is_service: false,
        created_by: actorId,
        updated_by: actorId,
      },
      "user_account",
      auditFor(ids.partner),
      accountSnapshot(partnerAccount, "PARTNER", ids.partner.toString()),
    );
    created += 1;
  }

  for (const seed of definitions.employee_types) {
    if (existing.employee_types.some((e) => e.code === seed.code)) {
      continue;
    }

    const permissionIds = resolvePermissionIds(
      seed.permission_codes,
      ids.permissions,
    );

    await createAudited(
      session,
      EmployeeTypeModel,
      {
        _id: ids.employee_types.get(seed.code),
        organization_id: ids.organization,
        partner_id: ids.partner,
        code: seed.code,
        name: seed.name,
        description: null,
        permission_ids: permissionIds,
        is_system: true,
        is_active: true,
        deleted_at: null,
        deleted_by: null,
        created_by: actorId,
        updated_by: actorId,
      },
      "employee_type",
      auditFor(ids.partner),
      {
        code: seed.code,
        name: seed.name,
        description: null,
        permission_ids: permissionIds.map((permissionId) =>
          permissionId.toString(),
        ),
        is_system: true,
        is_active: true,
      },
    );
    created += 1;
  }

  for (const seed of definitions.activity_types) {
    if (existing.activity_types.some((a) => a.code === seed.code)) {
      continue;
    }

    await createAudited(
      session,
      ActivityTypeModel,
      {
        _id: ids.activity_types.get(seed.code),
        organization_id: ids.organization,
        code: seed.code,
        name: seed.name,
        description: null,
        requires_offer: seed.requires_offer,
        is_active: true,
        created_by: actorId,
        updated_by: actorId,
      },
      "activity_type",
      auditFor(null),
      {
        code: seed.code,
        name: seed.name,
        description: null,
        requires_offer: seed.requires_offer,
        is_active: true,
      },
    );
    created += 1;
  }

  for (const seed of definitions.cities) {
    const key = cityKey(seed);

    if (existing.cities.some((city) => cityKey(city) === key)) {
      continue;
    }

    await createAudited(
      session,
      CityModel,
      {
        _id: ids.cities.get(key),
        organization_id: ids.organization,
        name: seed.name,
        normalized_name: seed.normalized_name,
        country_code: seed.country_code,
        region_code: seed.region_code,
        official_code: seed.official_code,
        is_active: true,
        deleted_at: null,
        deleted_by: null,
        created_by: actorId,
        updated_by: actorId,
      },
      "city",
      auditFor(null),
      {
        name: seed.name,
        normalized_name: seed.normalized_name,
        country_code: seed.country_code,
        region_code: seed.region_code,
        official_code: seed.official_code,
        is_active: true,
      },
    );
    created += 1;
  }

  return created;
}

export interface BootstrapApplyResult {
  created: number;
  request_id: string;
}

export async function applyBootstrap(
  definitions: BootstrapDefinitions,
  existing: ExistingState,
): Promise<BootstrapApplyResult> {
  const ids = buildIds(definitions, existing);
  const passwordHashes = new Map<string, string>();

  for (const { seed } of accountSeeds(definitions)) {
    if (seed.is_service) {
      continue;
    }

    if (existing.accounts.some((account) => account.email === seed.email)) {
      continue;
    }

    if (!seed.password) {
      throw new Error(`Password is missing for ${seed.email}`);
    }

    passwordHashes.set(seed.email, await hashPassword(seed.password));
  }

  const requestId = `bootstrap-${new Date().toISOString()}-${new Types.ObjectId().toString().slice(-8)}`;
  const session = await mongoose.startSession();

  try {
    let created = 0;

    await session.withTransaction(async () => {
      created = await createAll(
        session,
        definitions,
        existing,
        ids,
        passwordHashes,
        requestId,
      );
    });

    return { created, request_id: requestId };
  } finally {
    await session.endSession();
  }
}
