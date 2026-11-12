import "server-only";

import { createHash, randomUUID } from "node:crypto";

import mongoose, { Types, type HydratedDocument } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { assertPermission } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { recordHistoryChange } from "../../history-change/services/history.service";
import { OfferModel, type Offer } from "../../offer/entities/offer.entity";
import { AiRunModel, type AiRun } from "../../ai-run/entities/ai-run.entity";
import { AiSearchSettingsModel } from "../entities/ai-search-settings.entity";
import { uploadOfferImage } from "./r2.service";

const CONFIG_VERSION = "verla-ai-1.0.0";
const RESEARCH_LIMIT_CHARS = 12_000;
const MAX_SOURCES = 8;
const REQUEST_TIMEOUT_MS = 20_000;
const DEEPSEEK_TIMEOUT_MS = 90_000;

const RESEARCH_TARGETS = [
  {
    url: "https://www.claro.com.co/personas/servicios/servicios-hogar/internet/",
    title: "Claro Internet Hogar",
  },
  {
    url: "https://www.tigo.com.co/hogares/internet",
    title: "Tigo Internet Hogar",
  },
] as const;

const SIX_SKILLS = `
online_market_researcher: Research public home internet and fiber offers in Colombia. Prioritize official sources, collect verifiable details, and identify missing information.
competitive_offer_analyst: Compare equivalent plans by region, speed, introductory and regular prices, duration, and terms. Reference the sources supporting each finding.
commercial_strategy: Suggest differentiators consistent with VERLA capabilities. Identify prices, discounts, or benefits requiring business approval.
marketing_copywriter: Write clear Colombian Spanish copy with concrete benefits and visible terms. Use supported claims and accurate prices.
visual_art_director: Create original visuals consistent with VERLA branding and the offer copy.
commercial_quality_reviewer: Check consistency across sources, prices, terms, copy, and images. List details requiring administrator confirmation.
`.trim();

const GENERATION_PROMPT = `
Using the collected research and the six skills, create up to three commercial proposals.
Include title, copy, benefits, terms, rationale, pending confirmations, and an image brief.
Distinguish source facts from proposed VERLA terms. Return structured JSON matching:
{
  "proposals": [
    {
      "title": "string",
      "content": "string (Colombian Spanish)",
      "price_amount": "decimal string or null",
      "currency": "COP or null",
      "billing_period": "MONTHLY|ONE_TIME|OTHER|UNKNOWN",
      "benefits": ["string"],
      "conditions": ["string"],
      "strategy_summary": "string",
      "pending_questions": ["string"],
      "image_brief": "string"
    }
  ]
}
Proposals are DRAFT for administrator review. Do not invent prices or terms absent from the sources.
`;

export class AiResearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResearchError";
  }
}

export class AiResearchConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResearchConflictError";
  }
}

interface ResearchSource {
  url: string;
  title: string | null;
  consulted_at: Date;
}

interface GeneratedProposal {
  title: string;
  content: string;
  price_amount: string | null;
  currency: string | null;
  billing_period: "MONTHLY" | "ONE_TIME" | "OTHER" | "UNKNOWN";
  benefits: string[];
  conditions: string[];
  strategy_summary: string;
  pending_questions: string[];
  image_brief: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSource(
  target: (typeof RESEARCH_TARGETS)[number],
): Promise<{ source: ResearchSource; text: string } | null> {
  try {
    const response = await fetch(target.url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const text = stripHtml(html).slice(0, RESEARCH_LIMIT_CHARS);

    if (text.length < 200) {
      return null;
    }

    return {
      source: {
        url: target.url,
        title: target.title,
        consulted_at: new Date(),
      },
      text,
    };
  } catch {
    return null;
  }
}

async function deepSeekJson<T>(
  system: string,
  user: string,
): Promise<T> {
  const key = process.env.DEEPSEEK_API_KEY;

  if (!key) {
    throw new AiResearchError("DEEPSEEK_API_KEY no está configurada.");
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(DEEPSEEK_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new AiResearchError(
      `El proveedor de texto respondió ${response.status}.`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new AiResearchError("El proveedor de texto no devolvió contenido.");
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new AiResearchError("El proveedor de texto devolvió JSON inválido.");
  }
}

function normalizeProposal(value: unknown): GeneratedProposal | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const proposal = value as Record<string, unknown>;
  const title = typeof proposal.title === "string" ? proposal.title.trim() : "";
  const content =
    typeof proposal.content === "string" ? proposal.content.trim() : "";

  if (!title || !content) {
    return null;
  }

  const billingPeriods = ["MONTHLY", "ONE_TIME", "OTHER", "UNKNOWN"] as const;
  const billingPeriod = billingPeriods.includes(
    proposal.billing_period as (typeof billingPeriods)[number],
  )
    ? (proposal.billing_period as (typeof billingPeriods)[number])
    : "UNKNOWN";

  return {
    title,
    content,
    price_amount:
      typeof proposal.price_amount === "string" &&
      proposal.price_amount.trim()
        ? proposal.price_amount.trim()
        : null,
    currency:
      typeof proposal.currency === "string" && proposal.currency.trim()
        ? proposal.currency.trim().toUpperCase()
        : null,
    billing_period: billingPeriod,
    benefits: Array.isArray(proposal.benefits)
      ? proposal.benefits.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    conditions: Array.isArray(proposal.conditions)
      ? proposal.conditions.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    strategy_summary:
      typeof proposal.strategy_summary === "string"
        ? proposal.strategy_summary.trim()
        : "",
    pending_questions: Array.isArray(proposal.pending_questions)
      ? proposal.pending_questions.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    image_brief:
      typeof proposal.image_brief === "string"
        ? proposal.image_brief.trim()
        : "",
  };
}

async function generateImage(
  proposal: GeneratedProposal,
  runId: string,
  index: number,
): Promise<{ url: string; storage_key: string } | null> {
  const svg = await deepSeekJson<{ svg: string }>(
    "You create original SVG promotional banners. Return only JSON with an svg string. Use a 1200x630 viewBox, dark navy and teal palette, no scripts, no external images, no foreignObject.",
    `Create an SVG banner for this VERLA home internet proposal.
Title: ${proposal.title}
Copy: ${proposal.content.slice(0, 500)}
Image brief: ${proposal.image_brief}
Return JSON: {"svg":"<svg ...>...</svg>"}`,
  ).catch((error) => {
    console.warn("AI image generation failed:", error instanceof Error ? error.message : "unknown");
    return null;
  });

  let markup = svg?.svg?.trim() ?? "";
  const svgStart = markup.indexOf("<svg");

  if (svgStart >= 0) {
    markup = markup.slice(svgStart);
  }

  if (!markup || !markup.startsWith("<svg") || /<script/i.test(markup)) {
    console.warn("AI image markup invalid:", markup.slice(0, 40), markup.length);
    return null;
  }

  const key = `offers/${runId}/${index + 1}.svg`;
  const url = await uploadOfferImage(
    key,
    Buffer.from(markup, "utf-8"),
    "image/svg+xml",
  );

  if (!url) {
    console.warn("AI image upload failed for", key);
    return null;
  }

  return { url, storage_key: key };
}

export async function runAiResearch(
  context: AuthContext,
  requestId: string,
  maxOffers = 3,
): Promise<{
  status: string;
  message: string;
  offers: Array<{ id: string; title: string }>;
  sources: number;
}> {
  await assertPermission(context, "AI_SEARCH_SETTINGS_UPDATE");

  if (context.account_type !== "ORGANIZATION") {
    throw new AiResearchError("Solo la organización puede ejecutar la búsqueda.");
  }

  await connectToDatabase();

  const settings = await AiSearchSettingsModel.findOne({
    organization_id: context.organization_id,
  });

  if (!settings?.search_enabled) {
    throw new AiResearchError(
      "Activa search_enabled antes de lanzar la búsqueda.",
    );
  }

  const now = new Date();
  const active = await AiRunModel.findOne({
    organization_id: context.organization_id,
    kind: "RESEARCH",
    status: "RUNNING",
  });

  if (active) {
    if (active.expires_at <= now) {
      await AiRunModel.updateOne(
        { _id: active._id, status: "RUNNING" },
        {
          $set: {
            status: "FAILED",
            finished_at: now,
            error: "Expired research run",
          },
        },
      );
    } else {
      throw new AiResearchConflictError(
        "Ya hay una investigación activa para esta organización.",
      );
    }
  }

  const requestKey = randomUUID();
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ kind: "RESEARCH", config: CONFIG_VERSION }))
    .digest("hex");
  const expiresAt = new Date(now.getTime() + 3 * 60 * 1000);

  const run = await AiRunModel.create({
    organization_id: context.organization_id,
    kind: "RESEARCH",
    target_offer_id: null,
    requested_by: context.account_id,
    request_key: requestKey,
    request_hash: requestHash,
    status: "RUNNING",
    research_text: null,
    sources: [],
    offer_ids: [],
    config_version: CONFIG_VERSION,
    base_offer_version: null,
    started_at: now,
    finished_at: null,
    expires_at: expiresAt,
    error: null,
    usage: null,
  });

  const research = await Promise.all(
    RESEARCH_TARGETS.slice(0, MAX_SOURCES).map((target) => fetchSource(target)),
  );
  const successful = research.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );

  if (successful.length === 0) {
    await AiRunModel.updateOne(
      { _id: run._id, status: "RUNNING" },
      {
        $set: {
          status: "FAILED",
          finished_at: new Date(),
          error: "No se pudo consultar ninguna fuente pública.",
        },
      },
    );
    throw new AiResearchError(
      "No se pudo consultar ninguna fuente pública. Revisa la conectividad o los proveedores de origen.",
    );
  }

  const researchText = successful
    .map(
      (item) =>
        `FUENTE: ${item.source.title} (${item.source.url})\n${item.text}`,
    )
    .join("\n\n")
    .slice(0, RESEARCH_LIMIT_CHARS);
  const sources = successful.map((item) => item.source);

  let generated: { proposals?: unknown[]; usage?: { input_tokens?: number; output_tokens?: number } };

  try {
    generated = await deepSeekJson(
      `You are the VERLA commercial AI. Apply these fixed skills:\n${SIX_SKILLS}\n\n${GENERATION_PROMPT}`,
      `Fuentes consultadas:\n${researchText}\n\nGenera propuestas DRAFT para VERLA.`,
    );
  } catch (error) {
    await AiRunModel.updateOne(
      { _id: run._id, status: "RUNNING" },
      {
        $set: {
          status: "FAILED",
          finished_at: new Date(),
          research_text: researchText,
          sources,
          error:
            error instanceof Error ? error.message : "Generation failed",
        },
      },
    );
    throw error;
  }

  const proposals = Array.isArray(generated.proposals)
    ? generated.proposals
        .map(normalizeProposal)
        .filter((proposal): proposal is GeneratedProposal => proposal !== null)
        .slice(0, Math.max(1, Math.min(3, maxOffers)))
    : [];

  if (proposals.length === 0) {
    await AiRunModel.updateOne(
      { _id: run._id, status: "RUNNING" },
      {
        $set: {
          status: "PARTIAL",
          finished_at: new Date(),
          research_text: researchText,
          sources,
          error: "No se generaron propuestas válidas.",
        },
      },
    );
    throw new AiResearchError(
      "La investigación terminó sin propuestas válidas. Se conservó el intento.",
    );
  }

  const images = await Promise.all(
    proposals.map((proposal, index) =>
      generateImage(proposal, run._id.toString(), index),
    ),
  );

  const session = await mongoose.startSession();

  try {
    let createdOffers: Array<{ id: string; title: string }> = [];
    let usedFallbackImages = false;

    await session.withTransaction(async () => {
      for (let index = 0; index < proposals.length; index += 1) {
        const proposal = proposals[index];
        const image = images[index];
        if (!image) usedFallbackImages = true;

        const startsAt = new Date();
        const endsAt = new Date(startsAt.getTime() + 30 * 86_400_000);
        const pendingQuestions = [...proposal.pending_questions];

        if (!image) {
          pendingQuestions.push(
            "Imagen pendiente: no se pudo almacenar la imagen generada.",
          );
        }

        const [created] = await OfferModel.create(
          [
            {
              organization_id: context.organization_id,
              title: proposal.title,
              content: proposal.content,
              images: image
                ? [
                    {
                      url: image.url,
                      storage_key: image.storage_key,
                      alt_text: proposal.title,
                      sort_order: 0,
                    },
                  ]
                : [],
              starts_at: startsAt,
              ends_at: endsAt,
              status: "DRAFT",
              published_at: null,
              published_by: null,
              deleted_at: null,
              deleted_by: null,
              origin: "AI_ASSISTED",
              ai_run_id: run._id,
              generation_key: `${run._id.toString()}-${index + 1}`,
              commercial_terms: {
                price_amount: proposal.price_amount,
                currency: proposal.currency,
                billing_period: proposal.billing_period,
                benefits: proposal.benefits,
                conditions: proposal.conditions,
              },
              strategy_summary: proposal.strategy_summary,
              pending_questions: pendingQuestions,
              created_by: context.account_id,
              updated_by: context.account_id,
              version: 0,
            },
          ],
          { session },
        );

        createdOffers.push({
          id: created._id.toString(),
          title: created.title,
        });

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
            record_id: created._id,
            action: "CREATE",
            previous_values: null,
            new_values: {
              title: created.title,
              status: created.status,
              origin: created.origin,
              ai_run_id: run._id.toString(),
              generation_key: created.generation_key,
              version: created.version,
            },
          },
        );
      }

      await AiRunModel.updateOne(
        { _id: run._id, status: "RUNNING" },
        {
          $set: {
            status: usedFallbackImages ? "PARTIAL" : "SUCCEEDED",
            research_text: researchText,
            sources,
            offer_ids: createdOffers.map((offer) => new Types.ObjectId(offer.id)),
            finished_at: new Date(),
            error: usedFallbackImages
              ? "Algunas imágenes no se pudieron almacenar."
              : null,
            usage: {
              input_tokens: generated.usage?.input_tokens ?? null,
              output_tokens: generated.usage?.output_tokens ?? null,
              image_count: images.filter(Boolean).length,
            },
          },
        },
        { session },
      );

      settings.last_run_at = now;
      settings.next_run_at = settings.search_enabled
        ? new Date(now.getTime() + settings.frequency_days * 86_400_000)
        : null;
      settings.updated_by = context.account_id;
      await settings.save({ session });
    });

    return {
      status: usedFallbackImages ? "PARTIAL" : "SUCCEEDED",
      message: usedFallbackImages
        ? `Se crearon ${createdOffers.length} propuestas DRAFT. La imagen no se pudo almacenar; quedó pendiente.`
        : `Se crearon ${createdOffers.length} propuestas DRAFT con investigación e imagen.`,
      offers: createdOffers,
      sources: sources.length,
    };
  } finally {
    await session.endSession();
  }
}
