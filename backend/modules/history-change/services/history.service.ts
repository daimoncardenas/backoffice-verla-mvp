import "server-only";

import { type ClientSession, type Types } from "mongoose";

import {
  HistoryChangeModel,
  type HistoryEntityName,
} from "../entities/history-change.entity";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

export interface AuditContext {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId | null;
  actor_user_id: Types.ObjectId;
  request_id: string;
  reason?: string | null;
}

export interface AuditEntry {
  entity_name: HistoryEntityName;
  record_id: Types.ObjectId;
  action: AuditAction;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
}

const FORBIDDEN_AUDIT_FIELDS = new Set([
  "password",
  "password_hash",
  "token",
  "access_token",
  "refresh_token",
  "secret",
]);

function assertNoSecrets(values: Record<string, unknown> | null): void {
  if (!values) {
    return;
  }

  for (const key of Object.keys(values)) {
    if (FORBIDDEN_AUDIT_FIELDS.has(key.toLowerCase())) {
      throw new Error(`Audit values must not include the field "${key}"`);
    }
  }
}

function assertEntryShape(entry: AuditEntry): void {
  switch (entry.action) {
    case "CREATE":
      if (entry.previous_values !== null || entry.new_values === null) {
        throw new Error("CREATE requires previous_values null and new_values");
      }
      break;
    case "UPDATE":
      if (entry.previous_values === null || entry.new_values === null) {
        throw new Error("UPDATE requires previous_values and new_values");
      }
      break;
    case "DELETE":
      if (entry.previous_values === null || entry.new_values !== null) {
        throw new Error("DELETE requires previous_values and new_values null");
      }
      break;
  }

  assertNoSecrets(entry.previous_values);
  assertNoSecrets(entry.new_values);
}

export async function recordHistoryChange(
  session: ClientSession,
  context: AuditContext,
  entry: AuditEntry,
): Promise<void> {
  if (!session.inTransaction()) {
    throw new Error(
      "recordHistoryChange must run inside an active transaction",
    );
  }

  if (!context.request_id.trim()) {
    throw new Error("request_id is required");
  }

  assertEntryShape(entry);

  await HistoryChangeModel.create(
    [
      {
        organization_id: context.organization_id,
        partner_id: context.partner_id,
        entity_name: entry.entity_name,
        record_id: entry.record_id,
        action: entry.action,
        actor_user_id: context.actor_user_id,
        occurred_at: new Date(),
        previous_values: entry.previous_values,
        new_values: entry.new_values,
        request_id: context.request_id,
        reason: context.reason ?? null,
      },
    ],
    { session },
  );
}
