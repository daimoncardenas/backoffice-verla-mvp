import "server-only";

import { createHash, randomUUID } from "node:crypto";

import mongoose, { Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { assertPermission } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { recordHistoryChange } from "../../history-change/services/history.service";
import { AiRunModel } from "../../ai-run/entities/ai-run.entity";
import { OfferChatMessageModel } from "../../offer-chat-message/entities/offer-chat-message.entity";
import { OfferModel } from "../entities/offer.entity";
import { uploadOfferImage } from "../../ai-search-settings/services/r2.service";

const CONFIG_VERSION = "verla-ai-chat-1.0.0";
const DEEPSEEK_TIMEOUT_MS = 90_000;

export class OfferChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfferChatError";
  }
}

export class OfferChatConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfferChatConflictError";
  }
}

interface Correction {
  title: string;
  content: string;
  price_amount: string | null;
  currency: string | null;
  billing_period: "MONTHLY" | "ONE_TIME" | "OTHER" | "UNKNOWN";
  benefits: string[];
  conditions: string[];
  strategy_summary: string;
  pending_questions: string[];
  change_summary: string;
}

function parseCorrection(value: unknown): Correction {
  if (typeof value !== "object" || value === null) {
    throw new OfferChatError("La IA devolvió una corrección inválida.");
  }

  const item = value as Record<string, unknown>;
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const content = typeof item.content === "string" ? item.content.trim() : "";

  if (!title || !content) {
    throw new OfferChatError("La corrección no incluye título y contenido.");
  }

  return {
    title,
    content,
    price_amount:
      typeof item.price_amount === "string" && item.price_amount.trim()
        ? item.price_amount.trim()
        : null,
    currency:
      typeof item.currency === "string" && item.currency.trim()
        ? item.currency.trim().toUpperCase()
        : null,
    billing_period: ["MONTHLY", "ONE_TIME", "OTHER", "UNKNOWN"].includes(
      item.billing_period as string,
    )
      ? (item.billing_period as Correction["billing_period"])
      : "UNKNOWN",
    benefits: Array.isArray(item.benefits)
      ? item.benefits.filter((entry): entry is string => typeof entry === "string")
      : [],
    conditions: Array.isArray(item.conditions)
      ? item.conditions.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    strategy_summary:
      typeof item.strategy_summary === "string"
        ? item.strategy_summary.trim()
        : "",
    pending_questions: Array.isArray(item.pending_questions)
      ? item.pending_questions.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    change_summary:
      typeof item.change_summary === "string"
        ? item.change_summary.trim()
        : "Contenido actualizado.",
  };
}

async function askDeepSeek(
  offer: Awaited<ReturnType<typeof OfferModel.findOne>>,
  message: string,
  sources: Array<{ url: string; title: string | null }>,
  history: Array<{ role: "USER" | "ASSISTANT"; content: string }>,
): Promise<Correction> {
  const key = process.env.DEEPSEEK_API_KEY;

  if (!key) {
    throw new OfferChatError("DEEPSEEK_API_KEY no está configurada.");
  }

  if (!offer) {
    throw new OfferChatError("La oferta no existe.");
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are the VERLA commercial AI correcting a DRAFT offer. Keep supported facts, do not invent prices or terms. Use the previous conversation as context for follow-up requests. Return only JSON with title, content, price_amount, currency, billing_period, benefits, conditions, strategy_summary, pending_questions, change_summary.",
        },
        ...history.map((entry) => ({
          role: entry.role === "USER" ? "user" : "assistant",
          content: entry.content,
        })),
        {
          role: "user",
          content: `Oferta actual:\nTítulo: ${offer.title}\nContenido: ${offer.content}\nCondiciones: ${JSON.stringify(offer.commercial_terms)}\nFuentes: ${sources.map((source) => source.url).join(", ")}\n\nSolicitud del administrador:\n${message}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new OfferChatError(`El proveedor de texto respondió ${response.status}.`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new OfferChatError("El proveedor de texto no devolvió contenido.");
  }

  try {
    return parseCorrection(JSON.parse(content));
  } catch (error) {
    if (error instanceof OfferChatError) throw error;
    throw new OfferChatError("El proveedor de texto devolvió JSON inválido.");
  }
}

function shouldEditImage(message: string): boolean {
  return /imagen|banner|bot[oó]n|cta|visual|color|foto|logo|ilustraci[oó]n|dise[nñ]o|fondo/i.test(
    message,
  );
}

function extractSvgTexts(svg: string): string[] {
  return [...svg.matchAll(/>([^<>]{2,})</g)]
    .map((match) => match[1].trim())
    .filter((text) => text.length > 1);
}

const COLOR_NAMES: Record<string, string> = {
  blanco: "#ffffff",
  negro: "#000000",
  rojo: "#e53935",
  verde: "#14e0c8",
  azul: "#2563eb",
  morado: "#7c3aed",
  amarillo: "#facc15",
  naranja: "#f97316",
  coral: "#f97316",
  gris: "#94a3b8",
  celeste: "#38bdf8",
  turquesa: "#14b8a6",
};

function requestedColor(message: string): string | null {
  const hex = message.match(/#[0-9a-fA-F]{3,8}/)?.[0];

  if (hex) {
    return hex;
  }

  const normalized = message.toLowerCase();

  for (const [name, value] of Object.entries(COLOR_NAMES)) {
    if (normalized.includes(name)) {
      return value;
    }
  }

  return null;
}

function applyButtonColor(svg: string, color: string): string | null {
  const textColor =
    color.toLowerCase() === "#ffffff" || color.toLowerCase() === "#facc15"
      ? "#06202e"
      : "#ffffff";
  const groups = [...svg.matchAll(/<g[^>]*>[\s\S]*?<\/g>/g)];

  for (const group of groups) {
    const block = group[0];

    if (!/<rect[^>]*rx=/.test(block) || !/text-anchor="middle"/.test(block)) {
      continue;
    }

    let next = block.replace(
      /(<rect[^>]*?)fill="[^"]*"/,
      `$1fill="${color}"`,
    );
    next = next.replace(/(<text[^>]*?)fill="[^"]*"/, `$1fill="${textColor}"`);

    if (next !== block) {
      return svg.replace(block, next);
    }
  }

  return null;
}

async function editCorrectionImage(
  offer: NonNullable<Awaited<ReturnType<typeof OfferModel.findOne>>>,
  message: string,
  runId: string,
): Promise<{ url: string; storage_key: string } | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  const currentUrl = offer.images[0]?.url;

  if (!key || !currentUrl) {
    return null;
  }

  try {
    const currentResponse = await fetch(currentUrl, {
      headers: { "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

    if (!currentResponse.ok) {
      return null;
    }

    const currentSvg = await currentResponse.text();

    if (!currentSvg.includes("<svg") || /<script/i.test(currentSvg)) {
      return null;
    }

    const color = requestedColor(message);

    if (color && /bot[oó]n|cta|boton/i.test(message)) {
      const coloredSvg = applyButtonColor(currentSvg, color);

      if (coloredSvg && coloredSvg !== currentSvg) {
        const storageKey = `offers/${offer._id.toString()}/corrections/${runId}.svg`;
        const url = await uploadOfferImage(
          storageKey,
          Buffer.from(coloredSvg, "utf-8"),
          "image/svg+xml",
        );

        return url ? { url, storage_key: storageKey } : null;
      }
    }

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You map an administrator's request to exact text replacements in an existing SVG banner. Return only JSON: {\"replacements\":[{\"old\":\"exact text currently in the SVG\",\"new\":\"replacement text\"}]}. Only change text explicitly requested. Never redesign, recolor, move elements, or change other text.",
          },
          {
            role: "user",
            content: `Current SVG:\n${currentSvg}\n\nAdministrator request:\n${message}\n\nReturn the minimal exact text replacements.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      return null;
    }

    let replacements: Array<{ old?: string; new?: string }> = [];

    try {
      const parsed = JSON.parse(content) as {
        replacements?: Array<{ old?: string; new?: string }>;
      };
      replacements = parsed.replacements ?? [];
    } catch {
      return null;
    }

    let nextSvg = currentSvg;

    for (const replacement of replacements) {
      const oldText = replacement.old?.trim();
      const newText = replacement.new?.trim();

      if (!oldText || newText === undefined || oldText === newText) {
        continue;
      }

      if (!nextSvg.includes(oldText)) {
        continue;
      }

      nextSvg = nextSvg.split(oldText).join(newText);
    }

    if (nextSvg === currentSvg || !nextSvg.includes("<svg")) {
      return null;
    }

    const storageKey = `offers/${offer._id.toString()}/corrections/${runId}.svg`;
    const url = await uploadOfferImage(
      storageKey,
      Buffer.from(nextSvg, "utf-8"),
      "image/svg+xml",
    );

    return url ? { url, storage_key: storageKey } : null;
  } catch {
    return null;
  }
}

export async function listOfferChat(context: AuthContext, offerId: string) {
  await assertPermission(context, "OFFER_CHAT_LIST");
  await connectToDatabase();

  if (!Types.ObjectId.isValid(offerId)) {
    throw new OfferChatError("Oferta inválida.");
  }

  const offer = await OfferModel.findOne({
    _id: offerId,
    organization_id: context.organization_id,
  }).select("_id");

  if (!offer) {
    throw new OfferChatError("La oferta no existe o está fuera del alcance.");
  }

  const messages = await OfferChatMessageModel.find({
    organization_id: context.organization_id,
    offer_id: offer._id,
  })
    .sort({ created_at: 1, _id: 1 })
    .lean();

  return {
    messages: messages.map((entry) => ({
      id: entry._id.toString(),
      role: entry.role,
      content: entry.content,
      created_at: entry.created_at.toISOString(),
    })),
  };
}

export async function sendOfferChat(
  context: AuthContext,
  offerId: string,
  body: unknown,
  requestId: string,
) {
  await assertPermission(context, "OFFER_CHAT_CREATE");
  await connectToDatabase();

  if (!Types.ObjectId.isValid(offerId)) {
    throw new OfferChatError("Oferta inválida.");
  }

  if (typeof body !== "object" || body === null) {
    throw new OfferChatError("Solicitud inválida.");
  }

  const input = body as Record<string, unknown>;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const expectedVersion =
    typeof input.expectedVersion === "number" &&
    Number.isInteger(input.expectedVersion) &&
    input.expectedVersion >= 0
      ? input.expectedVersion
      : null;

  if (!message || message.length > 2000) {
    throw new OfferChatError("El mensaje debe tener entre 1 y 2000 caracteres.");
  }

  if (expectedVersion === null) {
    throw new OfferChatError("expectedVersion es obligatorio.");
  }

  const offer = await OfferModel.findOne({
    _id: offerId,
    organization_id: context.organization_id,
  });

  if (!offer) {
    throw new OfferChatError("La oferta no existe o está fuera del alcance.");
  }

  if (offer.status !== "DRAFT") {
    throw new OfferChatConflictError(
      "Solo las ofertas DRAFT admiten correcciones.",
    );
  }

  if (offer.version !== expectedVersion) {
    throw new OfferChatConflictError(
      "La oferta cambió. Recarga antes de enviar otra corrección.",
    );
  }

  const now = new Date();
  const active = await AiRunModel.findOne({
    organization_id: context.organization_id,
    target_offer_id: offer._id,
    status: "RUNNING",
  });

  if (active) {
    if (active.expires_at > now) {
      throw new OfferChatConflictError(
        "Ya hay una corrección activa para esta oferta.",
      );
    }

    await AiRunModel.updateOne(
      { _id: active._id, status: "RUNNING" },
      { $set: { status: "FAILED", finished_at: now, error: "Expired" } },
    );
  }

  const requestKey = randomUUID();
  const requestHash = createHash("sha256")
    .update(`${message}:${expectedVersion}`)
    .digest("hex");
  const run = await AiRunModel.create({
    organization_id: context.organization_id,
    kind: "CORRECTION",
    target_offer_id: offer._id,
    requested_by: context.account_id,
    request_key: requestKey,
    request_hash: requestHash,
    status: "RUNNING",
    research_text: null,
    sources: [],
    offer_ids: [offer._id],
    config_version: CONFIG_VERSION,
    base_offer_version: expectedVersion,
    started_at: now,
    finished_at: null,
    expires_at: new Date(now.getTime() + 3 * 60 * 1000),
    error: null,
    usage: null,
  });

  const researchRun = offer.ai_run_id
    ? await AiRunModel.findOne({ _id: offer.ai_run_id }).lean()
    : null;

  const previousMessages = await OfferChatMessageModel.find({
    organization_id: context.organization_id,
    offer_id: offer._id,
  })
    .sort({ created_at: -1, _id: -1 })
    .limit(20)
    .lean();
  const history = previousMessages
    .reverse()
    .map((entry) => ({ role: entry.role, content: entry.content }));

  let correction: Correction;

  try {
    correction = await askDeepSeek(
      offer,
      message,
      (researchRun?.sources ?? []).map((source) => ({
        url: source.url,
        title: source.title,
      })),
      history,
    );
  } catch (error) {
    await AiRunModel.updateOne(
      { _id: run._id, status: "RUNNING" },
      {
        $set: {
          status: "FAILED",
          finished_at: new Date(),
          error: error instanceof Error ? error.message : "Correction failed",
        },
      },
    );
    throw error;
  }

  const imageRequested =
    shouldEditImage(message) ||
    correction.title !== offer.title ||
    correction.content !== offer.content;
  const correctedImage = imageRequested
    ? await editCorrectionImage(offer, message, run._id.toString())
    : null;
  const existingImages = offer.images.map((image) => ({
    url: image.url,
    storage_key: image.storage_key,
    alt_text: image.alt_text,
    sort_order: image.sort_order + 1,
  }));
  const nextImages = correctedImage
    ? [
        {
          ...correctedImage,
          alt_text: correction.title,
          sort_order: 0,
        },
        ...existingImages,
      ].slice(0, 3)
    : offer.images;
  if (imageRequested) {
    const contentChanged =
      correction.title !== offer.title ||
      correction.content !== offer.content ||
      JSON.stringify(correction.benefits) !== JSON.stringify(offer.commercial_terms?.benefits ?? []) ||
      JSON.stringify(correction.conditions) !== JSON.stringify(offer.commercial_terms?.conditions ?? []);
    const summary = correction.change_summary
      .replace(/\s*La imagen[^.]*\./gi, "")
      .replace(/\s*Se registra[^.]*pendiente[^.]*\./gi, "")
      .replace(/\s*[^.]*ajuste de dise[nñ]o\/UI pendiente[^.]*\./gi, "")
      .trim();
    correction.change_summary = contentChanged
      ? `${summary}${
          correctedImage
            ? " La imagen se actualizó conservando su diseño."
            : " La imagen no se pudo actualizar; se conservó la anterior."
        }`.trim()
      : correctedImage
        ? "Se actualizó la imagen según la solicitud."
        : "No se pudo actualizar la imagen; se conservó la anterior.";
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const updated = await OfferModel.findOneAndUpdate(
        {
          _id: offer._id,
          organization_id: context.organization_id,
          status: "DRAFT",
          version: expectedVersion,
        },
        {
          $set: {
            title: correction.title,
            content: correction.content,
            commercial_terms: {
              price_amount: correction.price_amount,
              currency: correction.currency,
              billing_period: correction.billing_period,
              benefits: correction.benefits,
              conditions: correction.conditions,
            },
            strategy_summary: correction.strategy_summary || null,
            pending_questions: correctedImage
              ? correction.pending_questions.filter(
                  (question) =>
                    !/imagen|banner|bot[oó]n|cta|visual|color/i.test(question),
                )
              : correction.pending_questions,
            images: nextImages,
            updated_by: context.account_id,
          },
          $inc: { version: 1 },
        },
        { new: true, session },
      );

      if (!updated) {
        throw new OfferChatConflictError(
          "La oferta cambió. Recarga antes de enviar otra corrección.",
        );
      }

      const userMessage = await OfferChatMessageModel.create(
        [
          {
            organization_id: context.organization_id,
            offer_id: offer._id,
            role: "USER",
            content: message,
            actor_user_id: context.account_id,
            request_key: requestKey,
            ai_run_id: run._id,
            reply_to_message_id: null,
          },
        ],
        { session },
      );

      await OfferChatMessageModel.create(
        [
          {
            organization_id: context.organization_id,
            offer_id: offer._id,
            role: "ASSISTANT",
            content: correction.change_summary,
            actor_user_id: null,
            request_key: null,
            ai_run_id: run._id,
            reply_to_message_id: userMessage[0]._id,
          },
        ],
        { session },
      );

      await recordHistoryChange(
        session,
        {
          organization_id: context.organization_id,
          partner_id: null,
          actor_user_id: context.account_id,
          request_id: requestId,
        },
        {
          entity_name: "offer",
          record_id: offer._id,
          action: "UPDATE",
          previous_values: {
            title: offer.title,
            content: offer.content,
            commercial_terms: offer.commercial_terms,
            images: offer.images,
            version: offer.version,
          },
          new_values: {
            title: updated.title,
            content: updated.content,
            commercial_terms: updated.commercial_terms,
            images: updated.images,
            version: updated.version,
          },
        },
      );

      await AiRunModel.updateOne(
        { _id: run._id, status: "RUNNING" },
        {
          $set: {
            status: "SUCCEEDED",
            finished_at: new Date(),
            error: null,
            usage: { input_tokens: null, output_tokens: null, image_count: 0 },
          },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return {
    message: correction.change_summary,
    offer_version: offer.version + 1,
    messages: await listOfferChat(context, offerId),
  };
}
