import "server-only";

import mongoose from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { assertPermission } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { recordHistoryChange } from "../../history-change/services/history.service";
import { OrganizationModel } from "../../organization/entities/organization.entity";
import { UserAccountModel } from "../../user-account/entities/user-account.entity";

export class OrganizationProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationProfileValidationError";
  }
}

export class OrganizationProfileConflictError extends Error {
  constructor(message = "Profile was modified") {
    super(message);
    this.name = "OrganizationProfileConflictError";
  }
}

function serialize(
  account: {
    display_name: string;
    email: string;
    theme: string;
    version: number;
  },
  organization: {
    name: string;
    legal_name: string;
    tax_id: string;
    contact_email: string;
    phone: string | null;
    timezone: string;
    version: number;
  },
) {
  return {
    account: {
      display_name: account.display_name,
      email: account.email,
      theme: account.theme,
      version: account.version,
    },
    organization: {
      name: organization.name,
      legal_name: organization.legal_name,
      tax_id: organization.tax_id,
      contact_email: organization.contact_email,
      phone: organization.phone,
      timezone: organization.timezone,
      version: organization.version,
    },
  };
}

export async function getOrganizationProfile(context: AuthContext) {
  await assertPermission(context, "PROFILE_READ");

  if (context.account_type !== "ORGANIZATION") {
    throw new OrganizationProfileValidationError(
      "Only the organization can read this profile",
    );
  }

  await connectToDatabase();
  const account = await UserAccountModel.findOne({
    _id: context.account_id,
    organization_id: context.organization_id,
  });
  const organization = await OrganizationModel.findById(
    context.organization_id,
  );

  if (!account || !organization) {
    throw new OrganizationProfileValidationError("Profile not found");
  }

  return serialize(account, organization);
}

export interface UpdateOrganizationProfileInput {
  display_name?: string;
  contact_email?: string;
  phone?: string;
  expectedVersion: number;
  expectedOrganizationVersion?: number;
}

export async function updateOrganizationProfile(
  context: AuthContext,
  input: UpdateOrganizationProfileInput,
  requestId: string,
) {
  await assertPermission(context, "PROFILE_UPDATE");

  if (context.account_type !== "ORGANIZATION") {
    throw new OrganizationProfileValidationError(
      "Only the organization can edit this profile",
    );
  }

  await connectToDatabase();
  const session = await mongoose.startSession();

  try {
    let result: ReturnType<typeof serialize> | null = null;

    await session.withTransaction(async () => {
      const account = await UserAccountModel.findOne({
        _id: context.account_id,
        organization_id: context.organization_id,
      }).session(session);
      const organization = await OrganizationModel.findById(
        context.organization_id,
      ).session(session);

      if (!account || !organization) {
        throw new OrganizationProfileValidationError("Profile not found");
      }

      if (account.version !== input.expectedVersion) {
        throw new OrganizationProfileConflictError();
      }

      const accountChanges: Record<string, unknown> = {};
      const organizationChanges: Record<string, unknown> = {};

      if (input.display_name !== undefined) {
        const value = input.display_name.trim();
        if (!value) {
          throw new OrganizationProfileValidationError(
            "display_name is required",
          );
        }
        if (value !== account.display_name) accountChanges.display_name = value;
      }

      if (input.contact_email !== undefined) {
        const value = input.contact_email.trim().toLowerCase();
        if (!value) {
          throw new OrganizationProfileValidationError(
            "contact_email is required",
          );
        }
        if (value !== organization.contact_email) {
          organizationChanges.contact_email = value;
        }
      }

      if (input.phone !== undefined) {
        const value = input.phone.trim();
        if (value !== (organization.phone ?? "")) {
          organizationChanges.phone = value || null;
        }
      }

      if (Object.keys(organizationChanges).length > 0) {
        if (input.expectedOrganizationVersion === undefined) {
          throw new OrganizationProfileValidationError(
            "expectedOrganizationVersion is required",
          );
        }
        if (organization.version !== input.expectedOrganizationVersion) {
          throw new OrganizationProfileConflictError();
        }
      }

      const accountBefore = { display_name: account.display_name };
      const organizationBefore = {
        contact_email: organization.contact_email,
        phone: organization.phone,
      };

      if (Object.keys(accountChanges).length > 0) {
        Object.assign(account, accountChanges);
        account.updated_by = context.account_id;
        account.version += 1;
        await account.save({ session });

        await recordHistoryChange(
          session,
          {
            organization_id: context.organization_id,
            partner_id: null,
            actor_user_id: context.account_id,
            request_id: requestId,
          },
          {
            entity_name: "user_account",
            record_id: account._id,
            action: "UPDATE",
            previous_values: accountBefore,
            new_values: accountChanges,
          },
        );
      }

      if (Object.keys(organizationChanges).length > 0) {
        Object.assign(organization, organizationChanges);
        organization.updated_by = context.account_id;
        organization.version += 1;
        await organization.save({ session });

        await recordHistoryChange(
          session,
          {
            organization_id: context.organization_id,
            partner_id: null,
            actor_user_id: context.account_id,
            request_id: requestId,
          },
          {
            entity_name: "organization",
            record_id: organization._id,
            action: "UPDATE",
            previous_values: organizationBefore,
            new_values: organizationChanges,
          },
        );
      }

      result = serialize(account, organization);
    });

    if (!result) {
      throw new Error("Profile was not updated");
    }

    return result;
  } finally {
    await session.endSession();
  }
}
