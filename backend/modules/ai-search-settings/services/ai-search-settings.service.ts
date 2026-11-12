import "server-only";

import mongoose, { Types, type HydratedDocument } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { assertPermission } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { recordHistoryChange } from "../../history-change/services/history.service";
import {
  AiSearchSettingsModel,
  type AiSearchSettings,
} from "../entities/ai-search-settings.entity";

const FREQUENCIES = [1, 2, 3, 7] as const;

export class AiSearchSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiSearchSettingsValidationError";
  }
}

export class AiSearchSettingsConflictError extends Error {
  constructor(message = "Settings were modified") {
    super(message);
    this.name = "AiSearchSettingsConflictError";
  }
}

export function serializeAiSearchSettings(settings: {
  search_enabled: boolean;
  frequency_days: number;
  next_run_at: Date | null;
  last_run_at: Date | null;
  version: number;
  updated_at?: Date;
}) {
  return {
    search_enabled: settings.search_enabled,
    frequency_days: settings.frequency_days,
    next_run_at: settings.next_run_at?.toISOString() ?? null,
    last_run_at: settings.last_run_at?.toISOString() ?? null,
    version: settings.version,
    updated_at: settings.updated_at?.toISOString() ?? null,
  };
}

export async function getAiSearchSettings(context: AuthContext) {
  await assertPermission(context, "AI_SEARCH_SETTINGS_READ");

  if (context.account_type !== "ORGANIZATION") {
    throw new AiSearchSettingsValidationError(
      "Only the organization can read AI search settings",
    );
  }

  await connectToDatabase();
  const settings = await AiSearchSettingsModel.findOne({
    organization_id: context.organization_id,
  });

  return settings
    ? serializeAiSearchSettings(settings)
    : serializeAiSearchSettings({
        search_enabled: false,
        frequency_days: 1,
        next_run_at: null,
        last_run_at: null,
        version: 0,
      });
}

export interface UpdateAiSearchSettingsInput {
  expectedVersion: number;
  search_enabled: boolean;
  frequency_days: number;
}

export async function updateAiSearchSettings(
  context: AuthContext,
  input: UpdateAiSearchSettingsInput,
  requestId: string,
) {
  await assertPermission(context, "AI_SEARCH_SETTINGS_UPDATE");

  if (context.account_type !== "ORGANIZATION") {
    throw new AiSearchSettingsValidationError(
      "Only the organization can edit AI search settings",
    );
  }

  if (!FREQUENCIES.includes(input.frequency_days as 1 | 2 | 3 | 7)) {
    throw new AiSearchSettingsValidationError(
      "frequency_days must be 1, 2, 3 or 7",
    );
  }

  await connectToDatabase();
  const session = await mongoose.startSession();

  try {
    let updatedId: Types.ObjectId | null = null;

    await session.withTransaction(async () => {
      const existing = (await AiSearchSettingsModel.findOne({
        organization_id: context.organization_id,
      })) as HydratedDocument<AiSearchSettings> | null;

      if (existing && existing.version !== input.expectedVersion) {
        throw new AiSearchSettingsConflictError();
      }

      if (!existing && input.expectedVersion !== 0) {
        throw new AiSearchSettingsConflictError();
      }

      const nextRunAt = input.search_enabled
        ? new Date(Date.now() + input.frequency_days * 86_400_000)
        : null;

      if (!existing) {
        const [created] = await AiSearchSettingsModel.create(
          [
            {
              organization_id: context.organization_id,
              search_enabled: input.search_enabled,
              frequency_days: input.frequency_days as 1 | 2 | 3 | 7,
              next_run_at: nextRunAt,
              last_run_at: null,
              created_by: context.account_id,
              updated_by: context.account_id,
              version: 0,
            },
          ],
          { session },
        );

        updatedId = created._id;

        await recordHistoryChange(
          session,
          {
            organization_id: context.organization_id,
            partner_id: null,
            actor_user_id: context.account_id,
            request_id: requestId,
          },
          {
            entity_name: "ai_search_settings",
            record_id: created._id,
            action: "CREATE",
            previous_values: null,
            new_values: {
              search_enabled: created.search_enabled,
              frequency_days: created.frequency_days,
              next_run_at: created.next_run_at?.toISOString() ?? null,
              version: created.version,
            },
          },
        );
        return;
      }

      const previous = {
        search_enabled: existing.search_enabled,
        frequency_days: existing.frequency_days,
        next_run_at: existing.next_run_at?.toISOString() ?? null,
        version: existing.version,
      };

      existing.search_enabled = input.search_enabled;
      existing.frequency_days = input.frequency_days as 1 | 2 | 3 | 7;
      existing.next_run_at = nextRunAt;
      existing.updated_by = context.account_id;
      existing.version += 1;
      await existing.save({ session });

      updatedId = existing._id;

      await recordHistoryChange(
        session,
        {
          organization_id: context.organization_id,
          partner_id: null,
          actor_user_id: context.account_id,
          request_id: requestId,
        },
        {
          entity_name: "ai_search_settings",
          record_id: existing._id,
          action: "UPDATE",
          previous_values: previous,
          new_values: {
            search_enabled: existing.search_enabled,
            frequency_days: existing.frequency_days,
            next_run_at: existing.next_run_at?.toISOString() ?? null,
            version: existing.version,
          },
        },
      );
    });

    if (!updatedId) {
      throw new Error("AI search settings were not updated");
    }

    const updated = await AiSearchSettingsModel.findById(updatedId);

    if (!updated) {
      throw new Error("AI search settings were not updated");
    }

    return serializeAiSearchSettings(updated);
  } finally {
    await session.endSession();
  }
}

export async function requestAiSearch(
  context: AuthContext,
  requestId: string,
  maxOffers = 3,
) {
  const { runAiResearch } = await import("./ai-research.service");
  return runAiResearch(context, requestId, maxOffers);
}
