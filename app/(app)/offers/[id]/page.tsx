"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  PageHeader,
  Spinner,
} from "@/app/components/ui";
import { apiFetch, errorMessage } from "@/app/lib/api";
import { formatDate, formatDateTime, statusLabel } from "@/app/lib/format";
import { useApiData } from "@/app/lib/hooks";
import type { Offer } from "@/app/lib/types";

function statusTone(status: string) {
  if (status === "PUBLISHED") return "success" as const;
  if (status === "ARCHIVED") return "danger" as const;
  return "warning" as const;
}

export default function OfferDetailPage() {
  const params = useParams<{ id: string }>();
  const offer = useApiData<{
    offer: Offer;
    research: {
      sources: Array<{ url: string; title: string | null; consulted_at: string }>;
      research_text: string | null;
      config_version: string;
    } | null;
  }>(`/api/offers/${params.id}`);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const record = offer.data?.offer;

  async function sendChat() {
    if (!record || !chatInput.trim()) return;
    setSending(true);
    setChatError(null);

    try {
      await apiFetch(`/api/offers/${record.id}/chat`, {
        method: "POST",
        body: JSON.stringify({
          message: chatInput.trim(),
          expectedVersion: record.version,
        }),
      });
      setChatInput("");
      setChatNotice("Corrección aplicada. La oferta se actualizó.");
      offer.reload();
    } catch (cause) {
      setChatError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  async function act(action: "publish" | "discard") {
    if (!record) return;
    setBusy(true);
    setError(null);

    try {
      await apiFetch(`/api/offers/${record.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: record.version }),
      });
      offer.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (offer.loading && !record) {
    return <Spinner label="Cargando oferta…" />;
  }

  if (offer.error || !record) {
    return (
      <>
        <PageHeader title="Oferta" />
        <Alert tone="error">
          {offer.error ?? "La oferta no existe o está fuera del alcance."}
        </Alert>
        <Link href="/offers" className="btn btn-ghost">
          Volver a Ofertas
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={record.title}
        description="Detalle de la oferta y acciones de publicación."
        actions={
          <Link href="/offers" className="btn btn-ghost">
            Volver
          </Link>
        }
      />

      {error ? (
        <Alert
          tone="error"
          action={
            <Button size="sm" variant="secondary" onClick={() => offer.reload()}>
              Recargar
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      <div className="flex wrap">
        <Badge tone={statusTone(record.status ?? "DRAFT")}>
          {statusLabel(record.status ?? "DRAFT")}
        </Badge>
        <span className="text-xs muted">Versión {record.version}</span>
        {record.published_at ? (
          <span className="text-xs muted">
            Publicada {formatDateTime(record.published_at)}
          </span>
        ) : null}
      </div>

      <div className="grid-2">
        <div className="stack">
          <Card>
          <CardHeader title="Oferta" description="Contenido comercial." />
          <div className="card-body offer-card">
            <div className="offer-media">
              {record.images[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={record.images[0].url}
                  alt={record.images[0].alt_text}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                "Oferta VERLA"
              )}
            </div>

          <Card>
            <CardHeader
              title="Chat de corrección"
              description={
                record.status === "DRAFT"
                  ? "Pide cambios y la IA actualiza la propuesta."
                  : "La oferta publicada ya no admite correcciones."
              }
            />
            <div className="card-body stack">
              {chatError ? <Alert tone="error">{chatError}</Alert> : null}
              {chatNotice ? <Alert tone="success">{chatNotice}</Alert> : null}
              {record.status === "DRAFT" ? (
                <>
                  <textarea
                    className="input"
                    rows={3}
                    value={chatInput}
                    onChange={(event) => {
                      setChatInput(event.target.value);
                      setChatNotice(null);
                    }}
                    placeholder="Ej. Cambia el botón a “Llama hoy” y conserva el resto."
                    disabled={sending}
                  />
                  <Button onClick={sendChat} disabled={sending || !chatInput.trim()}>
                    {sending ? "Corrigiendo…" : "Enviar corrección"}
                  </Button>
                </>
              ) : null}
            </div>
          </Card>

            <p>{record.content}</p>
            <p className="text-xs muted">
              Vigencia: {formatDate(record.starts_at)} —{" "}
              {formatDate(record.ends_at)}
            </p>
            {record.commercial_terms ? (
              <div className="stack-sm">
                <strong>Condiciones</strong>
                <p className="text-sm muted">
                  {record.commercial_terms.price_amount ?? "Precio no definido"} ·{" "}
                  {record.commercial_terms.billing_period}
                </p>
                {record.commercial_terms.conditions.map((condition) => (
                  <p key={condition} className="text-sm muted">
                    · {condition}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </Card>


        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Acciones" description="Solo las ofertas DRAFT se publican o descartan." />
            <div className="card-body stack">
              {record.status === "DRAFT" ? (
                <>
                  <Button onClick={() => act("publish")} disabled={busy}>
                    {busy ? "Procesando…" : "Publicar oferta"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => act("discard")}
                    disabled={busy}
                  >
                    Descartar
                  </Button>
                </>
              ) : (
                <p className="text-sm muted">
                  La oferta ya no admite publicación ni descarte.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Fuentes"
              description="Origen de la propuesta."
            />
            <div className="card-body stack">
              {offer.data?.research?.sources.length ? (
                offer.data.research.sources.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="table-link text-sm"
                  >
                    {source.title ?? source.url}
                  </a>
                ))
              ) : (
                <p className="text-sm muted">
                  Sin fuentes registradas en esta oferta.
                </p>
              )}
            </div>
          </Card>

          {(record.pending_questions?.length ?? 0) > 0 ||
          record.strategy_summary ? (
            <Card>
              <CardHeader
                title="Revisión de la IA"
                description="Pendientes y racional de la propuesta."
              />
              <div className="card-body stack">
                {record.strategy_summary ? (
                  <p className="text-sm muted">{record.strategy_summary}</p>
                ) : null}
                {(record.pending_questions ?? []).map((question) => (
                  <p key={question} className="text-sm muted">
                    · {question}
                  </p>
                ))}
              </div>
            </Card>
          ) : null}


        </div>
      </div>
    </>
  );
}
