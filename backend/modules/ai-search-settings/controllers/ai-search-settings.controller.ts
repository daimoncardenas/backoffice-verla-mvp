import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  AiResearchConflictError,
  AiResearchError,
} from "../services/ai-research.service";
import {
  AiSearchSettingsConflictError,
  AiSearchSettingsValidationError,
  getAiSearchSettings,
  requestAiSearch,
  updateAiSearchSettings,
} from "../services/ai-search-settings.service";

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AiSearchSettingsValidationError("Invalid request body");
  }
  return body as Record<string, unknown>;
}

export async function handleGet(context: AuthContext) {
  return { settings: await getAiSearchSettings(context) };
}

export async function handleUpdate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const record = asRecord(body);

  if (
    typeof record.expectedVersion !== "number" ||
    !Number.isInteger(record.expectedVersion) ||
    record.expectedVersion < 0
  ) {
    throw new AiSearchSettingsValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  if (typeof record.search_enabled !== "boolean") {
    throw new AiSearchSettingsValidationError(
      "search_enabled must be a boolean",
    );
  }

  if (
    typeof record.frequency_days !== "number" ||
    !Number.isInteger(record.frequency_days)
  ) {
    throw new AiSearchSettingsValidationError(
      "frequency_days must be an integer",
    );
  }

  const settings = await updateAiSearchSettings(
    context,
    {
      expectedVersion: record.expectedVersion,
      search_enabled: record.search_enabled,
      frequency_days: record.frequency_days,
    },
    requestId,
  );

  return { settings };
}

export async function handleRun(
  context: AuthContext,
  requestId: string,
  body: unknown,
) {
  const maxOffers =
    typeof body === "object" &&
    body !== null &&
    "max_offers" in body &&
    typeof (body as { max_offers?: unknown }).max_offers === "number"
      ? (body as { max_offers: number }).max_offers
      : 3;

  return { result: await requestAiSearch(context, requestId, maxOffers) };
}

export function aiSearchSettingsErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof AiSearchSettingsValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof AiSearchSettingsConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof AiResearchConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof AiResearchError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
