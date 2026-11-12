"use client";

import { useState } from "react";

import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  PageHeader,
  Select,
} from "../../../components/ui";

export default function AiSearchSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [frequencyDays, setFrequencyDays] = useState("1");
  const [saved, setSaved] = useState(false);

  return (
    <>
      <PageHeader
        title="AI search"
        description="Configuración de la investigación automática de ofertas."
      />

      <div className="grid-2">
        <Card>
          <CardHeader
            title="Investigación automática"
            description="Frecuencia en zona America/Bogota."
          />
          <div className="card-body stack">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  setEnabled(event.target.checked);
                  setSaved(false);
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
                onChange={(event) => {
                  setFrequencyDays(event.target.value);
                  setSaved(false);
                }}
              >
                <option value="1">Cada 1 día</option>
                <option value="2">Cada 2 días</option>
                <option value="3">Cada 3 días</option>
                <option value="7">Cada 7 días</option>
              </Select>
            </Field>

            <Button onClick={() => setSaved(true)}>Guardar</Button>
            {saved ? (
              <Alert tone="success">
                Configuración local (backend pendiente).
              </Alert>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Estado"
            description="La investigación automática se ejecuta en el servidor."
          />
          <div className="card-body">
            <p className="text-sm muted">
              Esta pantalla deja la intención configurada. La persistencia en
              ai_search_settings queda pendiente para la integración de IA.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
