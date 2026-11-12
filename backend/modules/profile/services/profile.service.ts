import "server-only";

import mongoose, {
  Types,
  type ClientSession,
  type HydratedDocument,
} from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { assertPermission } from "../../authorization/services/permission.service";
import { hashPassword, verifyPassword } from "../../auth/services/password.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  recordHistoryChange,
  type AuditContext,
} from "../../history-change/services/history.service";
import type { Employee } from "../../employee/entities/employee.entity";
import type { Partner } from "../../partner/entities/partner.entity";
import type { UserAccount } from "../../user-account/entities/user-account.entity";
import {
  findProfileAccount,
  findProfileEmployee,
  findProfilePartner,
  updateProfileAccount,
  updateProfileEmployee,
  updateProfilePassword,
  updateProfilePartner,
} from "../repository/profile.repository";
import {
  ProfileConflictError,
  ProfileNotFoundError,
  ProfileValidationError,
} from "./profile.errors";
import type {
  ChangePasswordInput,
  UpdateProfileInput,
} from "../types/profile.types";

type AccountDocument = HydratedDocument<UserAccount>;
type PartnerDocument = HydratedDocument<Partner>;
type EmployeeDocument = HydratedDocument<Employee>;

const EMPLOYEE_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "job_title",
] as const;

const PARTNER_FIELDS = [
  "contact_name",
  "contact_email",
  "phone",
  "address",
] as const;

const SHARED_PROFILE_FIELDS = new Set(["phone"]);

export interface ProfileResponse {
  account: {
    id: string;
    account_type: "PARTNER" | "EMPLOYEE";
    display_name: string;
    email: string;
    theme: "LIGHT" | "DARK" | "SYSTEM";
    version: number;
  };
  partner?: {
    id: string;
    name: string;
    legal_name: string;
    contact_name: string;
    contact_email: string;
    phone: string;
    address: string | null;
    version: number;
  };
  employee?: {
    id: string;
    employee_type_id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    job_title: string;
    version: number;
  };
}

function buildAuditContext(
  context: AuthContext,
  requestId: string,
): AuditContext {
  return {
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    actor_user_id: context.account_id,
    request_id: requestId,
    reason: null,
  };
}

function withTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  return connectToDatabase().then(async () => {
    const session = await mongoose.startSession();

    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  });
}

async function loadProfileSources(context: AuthContext): Promise<{
  account: AccountDocument;
  partner: PartnerDocument | null;
  employee: EmployeeDocument | null;
}> {
  const account = await findProfileAccount(
    context.account_id,
    context.organization_id,
  );

  if (!account) {
    throw new ProfileNotFoundError();
  }

  if (account.account_type === "PARTNER") {
    const partner = await findProfilePartner(
      context.partner_id,
      context.organization_id,
    );

    if (!partner) {
      throw new ProfileNotFoundError();
    }

    return { account, partner, employee: null };
  }

  if (account.account_type === "EMPLOYEE") {
    if (!account.employee_id) {
      throw new ProfileNotFoundError();
    }

    const employee = await findProfileEmployee(
      account.employee_id,
      context.organization_id,
      context.partner_id,
    );

    if (!employee) {
      throw new ProfileNotFoundError();
    }

    return { account, partner: null, employee };
  }

  throw new ProfileNotFoundError();
}

export function buildProfileResponse(
  account: AccountDocument,
  partner: PartnerDocument | null,
  employee: EmployeeDocument | null,
): ProfileResponse {
  const response: ProfileResponse = {
    account: {
      id: account._id.toString(),
      account_type: account.account_type as "PARTNER" | "EMPLOYEE",
      display_name: account.display_name,
      email: account.email,
      theme: account.theme,
      version: account.version,
    },
  };

  if (partner) {
    response.partner = {
      id: partner._id.toString(),
      name: partner.name,
      legal_name: partner.legal_name,
      contact_name: partner.contact_name,
      contact_email: partner.contact_email,
      phone: partner.phone,
      address: partner.address,
      version: partner.version,
    };
  }

  if (employee) {
    response.employee = {
      id: employee._id.toString(),
      employee_type_id: employee.employee_type_id.toString(),
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email,
      phone: employee.phone,
      job_title: employee.job_title,
      version: employee.version,
    };
  }

  return response;
}

function normalizeRequiredText(value: string, field: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new ProfileValidationError(`${field} is required`);
  }

  return trimmed;
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function assertNoTitularFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  accountType: "PARTNER" | "EMPLOYEE",
): void {
  for (const field of fields) {
    if (field in record) {
      throw new ProfileValidationError(
        `${field} is not editable for ${accountType} profiles`,
      );
    }
  }
}

export function assertProfileFieldsForAccountType(
  accountType: "PARTNER" | "EMPLOYEE",
  record: Record<string, unknown>,
): void {
  const forbiddenFields = (
    accountType === "PARTNER" ? EMPLOYEE_FIELDS : PARTNER_FIELDS
  ).filter((field) => !SHARED_PROFILE_FIELDS.has(field));

  assertNoTitularFields(record, forbiddenFields, accountType);
}

function buildAccountChanges(
  account: AccountDocument,
  input: UpdateProfileInput,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};

  if (input.display_name !== undefined) {
    const displayName = normalizeRequiredText(
      input.display_name,
      "display_name",
    );

    if (displayName !== account.display_name) {
      changes.display_name = displayName;
    }
  }

  if (input.theme !== undefined && input.theme !== account.theme) {
    changes.theme = input.theme;
  }

  return changes;
}

function buildPartnerChanges(
  partner: PartnerDocument,
  input: UpdateProfileInput,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};

  if (input.contact_name !== undefined) {
    const contactName = normalizeRequiredText(
      input.contact_name,
      "contact_name",
    );

    if (contactName !== partner.contact_name) {
      changes.contact_name = contactName;
    }
  }

  if (input.contact_email !== undefined) {
    const contactEmail = normalizeRequiredText(
      input.contact_email,
      "contact_email",
    ).toLowerCase();

    if (contactEmail !== partner.contact_email) {
      changes.contact_email = contactEmail;
    }
  }

  if (input.phone !== undefined) {
    const phone = normalizeRequiredText(input.phone, "phone");

    if (phone !== partner.phone) {
      changes.phone = phone;
    }
  }

  if (input.address !== undefined) {
    const address = normalizeOptionalText(input.address);

    if (address !== partner.address) {
      changes.address = address;
    }
  }

  return changes;
}

function buildEmployeeChanges(
  employee: EmployeeDocument,
  input: UpdateProfileInput,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};

  if (input.first_name !== undefined) {
    const firstName = normalizeRequiredText(input.first_name, "first_name");

    if (firstName !== employee.first_name) {
      changes.first_name = firstName;
    }
  }

  if (input.last_name !== undefined) {
    const lastName = normalizeRequiredText(input.last_name, "last_name");

    if (lastName !== employee.last_name) {
      changes.last_name = lastName;
    }
  }

  if (input.email !== undefined) {
    const email = normalizeRequiredText(input.email, "email").toLowerCase();

    if (email !== employee.email) {
      changes.email = email;
    }
  }

  if (input.phone !== undefined) {
    const phone = normalizeRequiredText(input.phone, "phone");

    if (phone !== employee.phone) {
      changes.phone = phone;
    }
  }

  if (input.job_title !== undefined) {
    const jobTitle = normalizeRequiredText(input.job_title, "job_title");

    if (jobTitle !== employee.job_title) {
      changes.job_title = jobTitle;
    }
  }

  return changes;
}

function accountSnapshot(
  account: AccountDocument,
): Record<string, unknown> {
  return {
    display_name: account.display_name,
    theme: account.theme,
  };
}

function partnerSnapshot(
  partner: PartnerDocument,
): Record<string, unknown> {
  return {
    contact_name: partner.contact_name,
    contact_email: partner.contact_email,
    phone: partner.phone,
    address: partner.address,
  };
}

function employeeSnapshot(
  employee: EmployeeDocument,
): Record<string, unknown> {
  return {
    first_name: employee.first_name,
    last_name: employee.last_name,
    email: employee.email,
    phone: employee.phone,
    job_title: employee.job_title,
  };
}

function buildAuditDiff(
  snapshot: Record<string, unknown>,
  changes: Record<string, unknown>,
): {
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
} {
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const key of Object.keys(changes)) {
    previousValues[key] = snapshot[key];
    newValues[key] = changes[key];
  }

  return { previous_values: previousValues, new_values: newValues };
}

export function assertProfileVersion(
  currentVersion: number,
  expectedVersion: number,
  field: string,
): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new ProfileValidationError(
      `${field} must be a non-negative integer`,
    );
  }

  if (currentVersion !== expectedVersion) {
    throw new ProfileConflictError("Version conflict");
  }
}

function hasAnyField(
  record: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.some((field) => field in record);
}

export async function getProfile(
  context: AuthContext,
): Promise<ProfileResponse> {
  await assertPermission(context, "PROFILE_READ");

  const { account, partner, employee } = await loadProfileSources(context);

  return buildProfileResponse(account, partner, employee);
}

export async function updateProfile(
  context: AuthContext,
  input: UpdateProfileInput,
  requestBody: Record<string, unknown>,
  requestId: string,
): Promise<ProfileResponse> {
  await assertPermission(context, "PROFILE_UPDATE");

  const { account, partner, employee } = await loadProfileSources(context);

  assertProfileVersion(
    account.version,
    input.expectedVersion,
    "expectedVersion",
  );

  if (account.account_type === "PARTNER") {
    assertProfileFieldsForAccountType(account.account_type, requestBody);
  } else if (account.account_type === "EMPLOYEE") {
    assertProfileFieldsForAccountType(account.account_type, requestBody);
  } else {
    throw new ProfileNotFoundError();
  }

  const hasTitularFields =
    account.account_type === "PARTNER"
      ? hasAnyField(requestBody, PARTNER_FIELDS)
      : hasAnyField(requestBody, EMPLOYEE_FIELDS);

  if (hasTitularFields && input.expectedProfileVersion === undefined) {
    throw new ProfileValidationError(
      "expectedProfileVersion is required when editing profile fields",
    );
  }

  if (hasTitularFields && partner) {
    assertProfileVersion(
      partner.version,
      input.expectedProfileVersion!,
      "expectedProfileVersion",
    );
  }

  if (hasTitularFields && employee) {
    assertProfileVersion(
      employee.version,
      input.expectedProfileVersion!,
      "expectedProfileVersion",
    );
  }

  const accountChanges = buildAccountChanges(account, input);
  const titularChanges = partner
    ? buildPartnerChanges(partner, input)
    : employee
      ? buildEmployeeChanges(employee, input)
      : {};

  if (
    Object.keys(accountChanges).length === 0 &&
    Object.keys(titularChanges).length === 0
  ) {
    return buildProfileResponse(account, partner, employee);
  }

  const auditContext = buildAuditContext(context, requestId);

  return withTransaction(async (session) => {
    let updatedAccount = account;
    let updatedPartner = partner;
    let updatedEmployee = employee;

    if (Object.keys(accountChanges).length > 0) {
      const updated = await updateProfileAccount(
        {
          _id: account._id,
          organization_id: context.organization_id,
          version: input.expectedVersion,
          deleted_at: null,
          is_service: false,
        },
        {
          ...accountChanges,
          updated_by: context.account_id,
        },
        session,
      );

      if (!updated) {
        throw new ProfileConflictError("Version conflict");
      }

      updatedAccount = updated;

      const diff = buildAuditDiff(accountSnapshot(account), accountChanges);

      await recordHistoryChange(session, auditContext, {
        entity_name: "user_account",
        record_id: updated._id,
        action: "UPDATE",
        previous_values: diff.previous_values,
        new_values: diff.new_values,
      });
    }

    if (partner && Object.keys(titularChanges).length > 0) {
      const updated = await updateProfilePartner(
        {
          _id: partner._id,
          organization_id: context.organization_id,
          version: input.expectedProfileVersion!,
          deleted_at: null,
        },
        {
          ...titularChanges,
          updated_by: context.account_id,
        },
        session,
      );

      if (!updated) {
        throw new ProfileConflictError("Version conflict");
      }

      updatedPartner = updated;

      const diff = buildAuditDiff(partnerSnapshot(partner), titularChanges);

      await recordHistoryChange(session, auditContext, {
        entity_name: "partner",
        record_id: updated._id,
        action: "UPDATE",
        previous_values: diff.previous_values,
        new_values: diff.new_values,
      });
    }

    if (employee && Object.keys(titularChanges).length > 0) {
      const updated = await updateProfileEmployee(
        {
          _id: employee._id,
          organization_id: context.organization_id,
          partner_id: context.partner_id,
          version: input.expectedProfileVersion!,
          deleted_at: null,
        },
        {
          ...titularChanges,
          updated_by: context.account_id,
        },
        session,
      );

      if (!updated) {
        throw new ProfileConflictError("Version conflict");
      }

      updatedEmployee = updated;

      const diff = buildAuditDiff(employeeSnapshot(employee), titularChanges);

      await recordHistoryChange(session, auditContext, {
        entity_name: "employee",
        record_id: updated._id,
        action: "UPDATE",
        previous_values: diff.previous_values,
        new_values: diff.new_values,
      });
    }

    return buildProfileResponse(
      updatedAccount ?? account,
      updatedPartner ?? partner,
      updatedEmployee ?? employee,
    );
  });
}

export function buildPasswordAudit(
  previousTokenVersion: number,
  newTokenVersion: number,
): {
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
} {
  return {
    previous_values: { token_version: previousTokenVersion },
    new_values: { token_version: newTokenVersion },
  };
}

export async function changeProfilePassword(
  context: AuthContext,
  input: ChangePasswordInput,
  requestId: string,
): Promise<void> {
  await assertPermission(context, "PROFILE_UPDATE");

  if (input.new_password.length === 0) {
    throw new ProfileValidationError("new_password is required");
  }

  const account = await findProfileAccount(
    context.account_id,
    context.organization_id,
  );

  if (!account) {
    throw new ProfileNotFoundError();
  }

  assertProfileVersion(
    account.version,
    input.expectedVersion,
    "expectedVersion",
  );

  if (!account.password_hash) {
    throw new ProfileValidationError("Current password is invalid");
  }

  const isCurrentPasswordValid = await verifyPassword(
    input.current_password,
    account.password_hash,
  );

  if (!isCurrentPasswordValid) {
    throw new ProfileValidationError("Current password is invalid");
  }

  const passwordHash = await hashPassword(input.new_password);
  const auditContext = buildAuditContext(context, requestId);

  await withTransaction(async (session) => {
    const updated = await updateProfilePassword(
      {
        _id: account._id,
        organization_id: context.organization_id,
        version: input.expectedVersion,
        deleted_at: null,
        is_service: false,
      },
      passwordHash,
      context.account_id,
      session,
    );

    if (!updated) {
      throw new ProfileConflictError("Version conflict");
    }

    await recordHistoryChange(session, auditContext, {
      entity_name: "user_account",
      record_id: updated._id,
      action: "UPDATE",
      ...buildPasswordAudit(account.token_version, updated.token_version),
    });
  });
}
