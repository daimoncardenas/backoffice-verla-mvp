import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface OfferChatMessage {
  organization_id: Types.ObjectId;
  offer_id: Types.ObjectId;
  role: "USER" | "ASSISTANT";
  content: string;
  created_at: Date;
  actor_user_id: Types.ObjectId | null;
  request_key: string | null;
  ai_run_id: Types.ObjectId;
  reply_to_message_id: Types.ObjectId | null;
}

const offerChatMessageSchema = new Schema<OfferChatMessage>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    offer_id: { type: Schema.Types.ObjectId, ref: "Offer", required: true },
    role: {
      type: String,
      enum: ["USER", "ASSISTANT"],
      required: true,
    },
    content: { type: String, required: true },
    actor_user_id: {
      type: Schema.Types.ObjectId,
      ref: "UserAccount",
      default: null,
    },
    request_key: { type: String, default: null, trim: true },
    ai_run_id: {
      type: Schema.Types.ObjectId,
      ref: "AiRun",
      required: true,
    },
    reply_to_message_id: {
      type: Schema.Types.ObjectId,
      ref: "OfferChatMessage",
      default: null,
    },
  },
  {
    collection: "offer_chat_message",
    timestamps: { createdAt: "created_at", updatedAt: false },
    versionKey: false,
  },
);

offerChatMessageSchema.index({
  organization_id: 1,
  offer_id: 1,
  created_at: 1,
  _id: 1,
});
offerChatMessageSchema.index(
  { organization_id: 1, offer_id: 1, request_key: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: "USER",
      request_key: { $type: "string" },
    },
  },
);
offerChatMessageSchema.index(
  { organization_id: 1, reply_to_message_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: "ASSISTANT",
      reply_to_message_id: { $type: "objectId" },
    },
  },
);

export const OfferChatMessageModel: Model<OfferChatMessage> =
  (models.OfferChatMessage as Model<OfferChatMessage> | undefined) ??
  model<OfferChatMessage>("OfferChatMessage", offerChatMessageSchema);
