import "server-only";

import { Types } from "mongoose";

import {
  findAccountByEmail,
  findAccountById,
  findEmployeeById,
  findOrganizationById,
  findPartnerById,
} from "../repository/auth.repository";
import type { AuthContext, LoginAccountType } from "../types/auth.types";
import { signSessionToken, verifySessionToken } from "./jwt.service";
import { verifyPassword } from "./password.service";

export class AuthenticationError extends Error {
  constructor() {
    super("Invalid credentials");
    this.name = "AuthenticationError";
  }
}

type UserAccountDocument = NonNullable<
  Awaited<ReturnType<typeof findAccountByEmail>>
>;

async function resolveContext(
  account: UserAccountDocument,
): Promise<AuthContext | null> {
  if (account.is_service || account.deleted_at || account.status !== "ACTIVE") {
    return null;
  }

  if (!account.password_hash) {
    return null;
  }

  if (
    account.account_type !== "ORGANIZATION" &&
    account.account_type !== "PARTNER" &&
    account.account_type !== "EMPLOYEE"
  ) {
    return null;
  }

  const organization = await findOrganizationById(account.organization_id);

  if (!organization || organization.status !== "ACTIVE") {
    return null;
  }

  if (account.account_type === "ORGANIZATION") {
    return {
      account_id: account._id,
      display_name: account.display_name,
      email: account.email,
      account_type: "ORGANIZATION",
      theme: account.theme,
      organization_id: organization._id,
      organization_name: organization.name,
      timezone: organization.timezone,
      // Organization accounts have no partner scope. The organization id keeps
      // the shared AuthContext type stable for the copied modules.
      partner_id: organization._id,
      employee_id: null,
      supervisor_id: null,
    };
  }

  if (!account.partner_id) {
    return null;
  }

  const accountType: LoginAccountType = account.account_type;

  const partner = await findPartnerById(
    account.partner_id,
    account.organization_id,
  );

  if (!partner || partner.status !== "ACTIVE" || partner.deleted_at) {
    return null;
  }

  let employeeId: Types.ObjectId | null = null;
  let supervisorId: Types.ObjectId | null = null;

  if (accountType === "EMPLOYEE") {
    if (!account.employee_id) {
      return null;
    }

    const employee = await findEmployeeById(
      account.employee_id,
      account.organization_id,
      account.partner_id,
    );

    if (!employee || !isEmployeeSessionEligible(employee)) {
      return null;
    }

    employeeId = employee._id;
    supervisorId = employee.supervisor_id;
  }

  return {
    account_id: account._id,
    display_name: account.display_name,
    email: account.email,
    account_type: accountType,
    theme: account.theme,
    organization_id: organization._id,
    organization_name: organization.name,
    timezone: organization.timezone,
    partner_id: partner._id,
    employee_id: employeeId,
    supervisor_id: supervisorId,
  };
}

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<{ token: string; context: AuthContext }> {
  const normalizedEmail = email.trim().toLowerCase();
  const account = await findAccountByEmail(normalizedEmail);

  if (!account || !account.password_hash) {
    throw new AuthenticationError();
  }

  const passwordMatches = await verifyPassword(password, account.password_hash);

  if (!passwordMatches) {
    throw new AuthenticationError();
  }

  const context = await resolveContext(account);

  if (!context) {
    throw new AuthenticationError();
  }

  const token = await signSessionToken({
    sub: account._id.toString(),
    organization_id: account.organization_id.toString(),
    token_version: account.token_version,
  });

  return { token, context };
}

export function isSessionTokenCurrent(
  accountTokenVersion: number,
  tokenVersion: number,
): boolean {
  return accountTokenVersion === tokenVersion;
}

export function isEmployeeSessionEligible(employee: {
  status: string;
  deleted_at: Date | null;
}): boolean {
  return employee.status === "ACTIVE" && employee.deleted_at === null;
}

export async function getSessionContext(
  token: string,
): Promise<AuthContext | null> {
  const claims = await verifySessionToken(token);

  if (!claims) {
    return null;
  }

  if (
    !Types.ObjectId.isValid(claims.sub) ||
    !Types.ObjectId.isValid(claims.organization_id)
  ) {
    return null;
  }

  const account = await findAccountById(new Types.ObjectId(claims.sub));

  if (!account) {
    return null;
  }

  if (!isSessionTokenCurrent(account.token_version, claims.token_version)) {
    return null;
  }

  if (account.organization_id.toString() !== claims.organization_id) {
    return null;
  }

  return resolveContext(account);
}
