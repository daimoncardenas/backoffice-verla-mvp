import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export const HISTORY_ENTITY_NAMES = [
  "organization",
  "partner",
  "permission",
  "employee_type",
  "city",
  "employee",
  "employee_assignment",
  "activity_type",
  "offer",
  "goal",
  "employee_goal",
  "activity",
  "user_account",
  "ai_search_settings",
  "ai_run",
  "offer_chat_message",
] as const;

export type HistoryEntityName = (typeof HISTORY_ENTITY_NAMES)[number];

export interface HistoryChange {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId | null;
  entity_name: HistoryEntityName;
  record_id: Types.ObjectId;
  action: "CREATE" | "UPDATE" | "DELETE";
  actor_user_id: Types.ObjectId;
  occurred_at: Date;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  request_id: string;
  reason: string | null;
}

const historyChangeSchema = new Schema<HistoryChange>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    partner_id: { type: Schema.Types.ObjectId, ref: "Partner", default: null },
    entity_name: {
      type: String,
      enum: [...HISTORY_ENTITY_NAMES],
      required: true,
    },
    record_id: { type: Schema.Types.ObjectId, required: true },
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE"],
      required: true,
    },
    actor_user_id: {
      type: Schema.Types.ObjectId,
      ref: "UserAccount",
      required: true,
    },
    occurred_at: { type: Date, required: true },
    previous_values: { type: Schema.Types.Mixed, default: null },
    new_values: { type: Schema.Types.Mixed, default: null },
    request_id: { type: String, required: true, trim: true },
    reason: { type: String, default: null, trim: true },
  },
  {
    collection: "history_changes",
    timestamps: false,
    versionKey: false,
  },
);

historyChangeSchema.index({
  organization_id: 1,
  entity_name: 1,
  record_id: 1,
  occurred_at: -1,
});
historyChangeSchema.index({
  organization_id: 1,
  partner_id: 1,
  occurred_at: -1,
});
historyChangeSchema.index({ request_id: 1 });

export const HistoryChangeModel: Model<HistoryChange> =
  (models.HistoryChange as Model<HistoryChange> | undefined) ??
  model<HistoryChange>("HistoryChange", historyChangeSchema);
