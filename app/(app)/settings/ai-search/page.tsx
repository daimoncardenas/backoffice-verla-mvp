"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  PageHeader,
  Select,
  Spinner,
} from "../../../components/ui";
import { apiFetch, errorMessage } from "../../../lib/api";
import { formatDateTime } from "../../../lib/format";
import { useApiData } from "../../../lib/hooks";

interface AiSearchSettings {
  search_enabled: boolean;
  frequency_days: number;
  next_run_at: string | null;
  last_run_at: string | null;
  version: number;
}

export default function AiSearchSettingsPage() {
  const settings = useApiData<{ settings: AiSearchSettings }>(
    "/api/ai-search-settings",
  );
  const [enabled, setEnabled] = useState(false);
  const [frequencyDays, setFrequencyDays] = useState("1");
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "warning">("success");
  const [createdOffers, setCreatedOffers] = useState<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    if (settings.data?.settings) {
      setEnabled(settings.data.settings.search_enabled);
      setFrequencyDays(String(settings.data.settings.frequency_days));
      setVersion(settings.data.settings.version);
    }
  }, [settings.data]);

  async function save(nextEnabled: boolean, nextFrequency: number) {
    setSaving(true);
    setError(null);

    try {
      const result = await apiFetch<{ settings: AiSearchSettings }>(
        "/api/ai-search-settings",
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: version,
            search_enabled: nextEnabled,
            frequency_days: nextFrequency,
          }),
        },
      );
      setVersion(result.settings.version);
      settings.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function runSearch(maxOffers: number) {
    setRunning(true);
    setError(null);
    setMessage(null);
    setCreatedOffers([]);

    try {
      const result = await apiFetch<{
        result: {
          status: string;
          message: string;
          offers: Array<{ id: string; title: string }>;
        };
      }>("/api/ai-search-settings/run", {
        method: "POST",
        body: JSON.stringify({ max_offers: maxOffers }),
      });
      setMessage(result.result.message);
      setMessageTone(result.result.status === "SUCCEEDED" ? "success" : "warning");
      setCreatedOffers(result.result.offers ?? []);
      settings.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title="AI search"
        description="Investigación automática de ofertas de internet hogar y fibra."
      />

      <div className="grid-2">
        <Card>
          <CardHeader
            title="Investigación automática"
            description="search_enabled y frequency_days en America/Bogota."
          />
          <div className="card-body stack">
            {settings.loading ? <Spinner label="Cargando configuración…" /> : null}
            {settings.error ? <Alert tone="error">{settings.error}</Alert> : null}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={enabled}
                disabled={saving}
                onChange={(event) => {
                  const next = event.target.checked;
                  setEnabled(next);
                  setMessage(null);
                  void save(next, Number(frequencyDays));
                }}
              />
              <span>
                <strong>search_enabled</strong>
                <br />
                <span className="muted text-xs">
                  Activa una investigación automática por organización.
                </span>
              </span>
            </label>

            <Field label="frequency_days" htmlFor="frequency_days">
              <Select
                id="frequency_days"
                value={frequencyDays}
                disabled={saving}
                onChange={(event) => {
                  const next = event.target.value;
                  setFrequencyDays(next);
                  setMessage(null);
                  void save(enabled, Number(next));
                }}
              >
                <option value="1">Cada 1 día</option>
                <option value="2">Cada 2 días</option>
                <option value="3">Cada 3 días</option>
                <option value="7">Cada 7 días</option>
              </Select>
            </Field>

            <p className="hint">
              Los cambios se guardan automáticamente.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Generar una oferta ahora"
            description="Investigación manual de una sola propuesta."
          />
          <div className="card-body stack">
            {error ? <Alert tone="error">{error}</Alert> : null}
            {message ? <Alert tone={messageTone}>{message}</Alert> : null}
            {createdOffers.length > 0 ? (
              <div className="stack-sm">
                {createdOffers.map((offer) => (
                  <Link
                    key={offer.id}
                    href={`/offers/${offer.id}`}
                    className="table-link"
                  >
                    {offer.title} →
                  </Link>
                ))}
              </div>
            ) : null}
            <p className="text-sm muted">
              Consulta las fuentes públicas y genera una propuesta DRAFT con
              texto, condiciones e imagen. No altera la programación automática.
            </p>
            <Button
              variant="secondary"
              onClick={() => runSearch(1)}
              disabled={running || !enabled}
            >
              {running ? "Generando…" : "Generar una oferta"}
            </Button>
            {!enabled ? (
              <p className="hint">
                Activa search_enabled para habilitar la generación manual.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Estado"
            description="Programación y última ejecución."
          />
          <div className="card-body stack">
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr>
                    <th>next_run_at</th>
                    <td>{formatDateTime(settings.data?.settings.next_run_at)}</td>
                  </tr>
                  <tr>
                    <th>last_run_at</th>
                    <td>{formatDateTime(settings.data?.settings.last_run_at)}</td>
                  </tr>
                  <tr>
                    <th>version</th>
                    <td>{version}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Alert tone="info">
              La investigación usa las seis skills fijas, DeepSeek para texto e
              imagen, y Cloudflare R2 para almacenar la imagen generada.
            </Alert>
          </div>
        </Card>
      </div>
    </>
  );
}
