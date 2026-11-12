import "server-only";

import mongoose, { Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import {
  assertPermission,
  ForbiddenError,
} from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { hashPassword } from "../../auth/services/password.service";
import { PermissionModel } from "../../permission/entities/permission.entity";
import { UserAccountModel } from "../../user-account/entities/user-account.entity";
import { recordHistoryChange } from "../../history-change/services/history.service";
import { PartnerModel, type Partner } from "../entities/partner.entity";

export class PartnerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartnerValidationError";
  }
}

export class PartnerConflictError extends Error {
  constructor(message = "Partner already exists") {
    super(message);
    this.name = "PartnerConflictError";
  }
}

export interface CreatePartnerInput {
  name: string;
  legal_name: string;
  document_type: string;
  document_number: string;
  contact_name: string;
  contact_email: string;
  phone: string;
  address?: string | null;
}

export type PartnerDocument = Awaited<
  ReturnType<typeof PartnerModel.findOne>
>;

export function serializePartner(partner: NonNullable<PartnerDocument>) {
  return {
    id: partner._id.toString(),
    name: partner.name,
    legal_name: partner.legal_name,
    document_type: partner.document_type,
    document_number: partner.document_number,
    contact_name: partner.contact_name,
    contact_email: partner.contact_email,
    phone: partner.phone,
    address: partner.address,
    status: partner.status,
    version: partner.version,
    created_at: partner.created_at.toISOString(),
    updated_at: partner.updated_at.toISOString(),
  };
}

export async function listPartners(context: AuthContext) {
  await assertPermission(context, "PARTNER_LIST");

  if (context.account_type !== "ORGANIZATION") {
    throw new ForbiddenError("PARTNER_LIST");
  }

  await connectToDatabase();

  return PartnerModel.find({
    organization_id: context.organization_id,
    deleted_at: null,
  }).sort({ created_at: -1 });
}

function defaultPartnerPassword(): string {
  return (
    process.env.DEFAULT_PARTNER_PASSWORD ??
    process.env.DEFAULT_EMPLOYEE_PASSWORD ??
    "1234567"
  );
}

export async function createPartner(
  context: AuthContext,
  input: CreatePartnerInput,
  requestId: string,
) {
  await assertPermission(context, "PARTNER_CREATE");

  if (context.account_type !== "ORGANIZATION") {
    throw new ForbiddenError("PARTNER_CREATE");
  }

  await connectToDatabase();

  const accountEmail = input.contact_email.trim().toLowerCase();
  const existingAccount = await UserAccountModel.findOne({ email: accountEmail });

  if (existingAccount) {
    throw new PartnerConflictError(
      "Ya existe una cuenta con ese correo de contacto.",
    );
  }

  const passwordHash = await hashPassword(defaultPartnerPassword());

  const existing = await PartnerModel.findOne({
    organization_id: context.organization_id,
    document_type: input.document_type,
    document_number: input.document_number,
    deleted_at: null,
  });

  if (existing) {
    throw new PartnerConflictError(
      "Ya existe un aliado con ese documento.",
    );
  }

  const permissions = await PermissionModel.find({
    organization_id: context.organization_id,
    is_active: true,
  })
    .select("_id")
    .lean();
  const enabledPermissionIds = permissions.map(
    (permission) => permission._id as Types.ObjectId,
  );

  const session = await mongoose.startSession();

  try {
    let createdId: Types.ObjectId | null = null;

    await session.withTransaction(async () => {
      const [document] = await PartnerModel.create(
        [
          {
            organization_id: context.organization_id,
            name: input.name,
            legal_name: input.legal_name,
            document_type: input.document_type,
            document_number: input.document_number,
            contact_name: input.contact_name,
            contact_email: input.contact_email,
            phone: input.phone,
            address: input.address ?? null,
            contract_reference: null,
            enabled_permission_ids: enabledPermissionIds,
            status: "ACTIVE",
            status_reason: null,
            status_changed_at: null,
            status_changed_by: null,
            deleted_at: null,
            deleted_by: null,
            created_by: context.account_id,
            updated_by: context.account_id,
            version: 0,
          },
        ],
        { session },
      );

      createdId = document._id;

      const [account] = await UserAccountModel.create(
        [
          {
            organization_id: context.organization_id,
            partner_id: document._id,
            employee_id: null,
            account_type: "PARTNER",
            display_name: input.contact_name,
            email: accountEmail,
            password_hash: passwordHash,
            status: "ACTIVE",
            token_version: 0,
            last_login_at: null,
            theme: "SYSTEM",
            deleted_at: null,
            deleted_by: null,
            is_service: false,
            created_by: context.account_id,
            updated_by: context.account_id,
            version: 0,
          },
        ],
        { session },
      );

      await recordHistoryChange(
        session,
        {
          organization_id: context.organization_id,
          partner_id: document._id,
          actor_user_id: context.account_id,
          request_id: requestId,
        },
        {
          entity_name: "partner",
          record_id: document._id,
          action: "CREATE",
          previous_values: null,
          new_values: {
            name: document.name,
            legal_name: document.legal_name,
            document_type: document.document_type,
            document_number: document.document_number,
            contact_name: document.contact_name,
            contact_email: document.contact_email,
            phone: document.phone,
            address: document.address,
            enabled_permission_ids:
              document.enabled_permission_ids.map((id) => id.toString()),
            status: document.status,
            version: document.version,
          },
        },
      );

      await recordHistoryChange(
        session,
        {
          organization_id: context.organization_id,
          partner_id: document._id,
          actor_user_id: context.account_id,
          request_id: requestId,
        },
        {
          entity_name: "user_account",
          record_id: account._id,
          action: "CREATE",
          previous_values: null,
          new_values: {
            account_type: account.account_type,
            partner_id: document._id.toString(),
            employee_id: null,
            email: account.email,
            status: account.status,
            version: account.version,
          },
        },
      );
    });

    if (!createdId) {
      throw new Error("Partner was not created");
    }

    return await PartnerModel.findById(createdId);
  } finally {
    await session.endSession();
  }
}
