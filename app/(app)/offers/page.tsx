"use client";

import { useMemo, useState, type FormEvent } from "react";

import { useSession } from "../../components/session-context";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from "../../components/ui";
import { apiFetch, errorMessage } from "../../lib/api";
import { formatDate, statusLabel } from "../../lib/format";
import { useApiData } from "../../lib/hooks";
import { hasPermission } from "../../lib/permissions";
import type { Offer } from "../../lib/types";

function statusTone(status: string) {
  if (status === "PUBLISHED") return "success" as const;
  if (status === "ARCHIVED") return "danger" as const;
  return "warning" as const;
}

export default function OffersPage() {
  const session = useSession();
  const canList = hasPermission(session.permissions, "OFFER_LIST");
  const canCreate = hasPermission(session.permissions, "OFFER_CREATE");
  const canPublish = hasPermission(session.permissions, "OFFER_PUBLISH");
  const canDiscard = hasPermission(session.permissions, "OFFER_DISCARD");
  const offers = useApiData<{ offers: Offer[] }>(
    canList ? "/api/offers" : null,
  );

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [startsAt, setStartsAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [endsAt, setEndsAt] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows = useMemo(() => offers.data?.offers ?? [], [offers.data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await apiFetch("/api/offers", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          starts_at: new Date(`${startsAt}T00:00:00`).toISOString(),
          ends_at: new Date(`${endsAt}T23:59:00`).toISOString(),
        }),
      });
      setOpen(false);
      setTitle("");
      setContent("");
      offers.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function act(offer: Offer, action: "publish" | "discard") {
    setActionId(offer.id);
    setActionError(null);

    try {
      await apiFetch(`/api/offers/${offer.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: offer.version }),
      });
      offers.reload();
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setActionId(null);
    }
  }

  if (!canList) {
    return (
      <>
        <PageHeader title="Ofertas" />
        <Alert tone="error">
          Tu cuenta no tiene permiso OFFER_LIST para consultar ofertas.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Ofertas"
        description="Crea, publica y archiva ofertas de la organización."
        actions={
          canCreate ? (
            <Button onClick={() => { setError(null); setOpen(true); }}>
              + Crear oferta
            </Button>
          ) : undefined
        }
      />

      {actionError ? (
        <Alert
          tone="error"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => offers.reload()}
            >
              Recargar
            </Button>
          }
        >
          {actionError}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Ofertas de la organización"
          description="Solo las ofertas publicadas llegan a los aliados."
        />
        <div className="card-body">
          {offers.error ? <Alert tone="error">{offers.error}</Alert> : null}
          {offers.loading ? <Spinner label="Cargando ofertas…" /> : null}
          {!offers.loading && rows.length === 0 ? (
            <EmptyState
              title="Sin ofertas"
              description="Crea la primera oferta para publicarla en la red."
              action={
                canCreate ? (
                  <Button size="sm" onClick={() => setOpen(true)}>
                    Crear oferta
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {rows.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Estado</th>
                    <th>Inicio</th>
                    <th>Fin</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((offer) => (
                    <tr key={offer.id}>
                      <td>
                        <div className="cell-stack">
                          <strong>{offer.title}</strong>
                          <span>{offer.content.slice(0, 80)}</span>
                        </div>
                      </td>
                      <td>
                        <Badge tone={statusTone(offer.status ?? "DRAFT")}>
                          {statusLabel(offer.status ?? "DRAFT")}
                        </Badge>
                      </td>
                      <td>{formatDate(offer.starts_at)}</td>
                      <td>{formatDate(offer.ends_at)}</td>
                      <td>
                        <div className="row-actions">
                          {offer.status === "DRAFT" && canPublish ? (
                            <Button
                              size="sm"
                              onClick={() => act(offer, "publish")}
                              disabled={actionId === offer.id}
                            >
                              {actionId === offer.id
                                ? "Publicando…"
                                : "Publicar"}
                            </Button>
                          ) : null}
                          {offer.status === "DRAFT" && canDiscard ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => act(offer, "discard")}
                              disabled={actionId === offer.id}
                            >
                              Descartar
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </Card>

      <Modal
        open={open}
        title="Crear oferta"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                const form = document.getElementById("offer-form");
                form?.dispatchEvent(
                  new Event("submit", { bubbles: true, cancelable: true }),
                );
              }}
            >
              {saving ? "Creando…" : "Crear oferta"}
            </Button>
          </>
        }
      >
        <form id="offer-form" className="stack" onSubmit={submit}>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Título" htmlFor="offer_title">
            <Input
              id="offer_title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </Field>
          <Field label="Contenido" htmlFor="offer_content">
            <Textarea
              id="offer_content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
            />
          </Field>
          <div className="form-grid">
            <Field label="Inicio" htmlFor="offer_starts">
              <Input
                id="offer_starts"
                type="date"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                required
              />
            </Field>
            <Field label="Fin" htmlFor="offer_ends">
              <Input
                id="offer_ends"
                type="date"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                required
              />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
