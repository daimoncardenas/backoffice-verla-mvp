import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  createPartner,
  listPartners,
  PartnerConflictError,
  PartnerValidationError,
  serializePartner,
} from "../services/partner.service";

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PartnerValidationError("Invalid request body");
  }

  return body as Record<string, unknown>;
}

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PartnerValidationError(`${field} is required`);
  }

  return value.trim();
}

export async function handleList(context: AuthContext) {
  const partners = await listPartners(context);

  return {
    partners: partners.map((partner) => serializePartner(partner)),
  };
}

export async function handleCreate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const record = asRecord(body);
  const partner = await createPartner(
    context,
    {
      name: required(record.name, "name"),
      legal_name: required(record.legal_name, "legal_name"),
      document_type: required(record.document_type, "document_type"),
      document_number: required(record.document_number, "document_number"),
      contact_name: required(record.contact_name, "contact_name"),
      contact_email: required(record.contact_email, "contact_email").toLowerCase(),
      phone: required(record.phone, "phone"),
      address:
        typeof record.address === "string" && record.address.trim()
          ? record.address.trim()
          : null,
    },
    requestId,
  );

  if (!partner) {
    throw new Error("Partner was not created");
  }

  return { partner: serializePartner(partner) };
}

export function partnerErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof PartnerValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof PartnerConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
