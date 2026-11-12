"use client";

import { useState, type FormEvent } from "react";

import { useSession } from "../../../components/session-context";
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
  Spinner,
  Textarea,
} from "../../../components/ui";
import { apiFetch, errorMessage } from "../../../lib/api";
import { useApiData } from "../../../lib/hooks";
import { hasPermission } from "../../../lib/permissions";
import type { ActivityType } from "../../../lib/types";

type BackofficeActivityType = ActivityType & { is_active?: boolean };

export default function ActivityTypesPage() {
  const session = useSession();
  const canList = hasPermission(session.permissions, "ACTIVITY_TYPE_LIST");
  const canCreate = hasPermission(session.permissions, "ACTIVITY_TYPE_CREATE");
  const types = useApiData<{ activity_types: BackofficeActivityType[] }>(
    canList ? "/api/activity-types" : null,
  );

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [requiresOffer, setRequiresOffer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await apiFetch("/api/activity-types", {
        method: "POST",
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || null,
          requires_offer: requiresOffer,
        }),
      });
      setOpen(false);
      setCode("");
      setName("");
      setDescription("");
      setRequiresOffer(false);
      types.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (!canList) {
    return (
      <>
        <PageHeader title="Activity types" />
        <Alert tone="error">
          Tu cuenta no tiene permiso ACTIVITY_TYPE_LIST.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Activity types"
        description="Catálogo de tipos de actividad de la organización."
        actions={
          canCreate ? (
            <Button onClick={() => { setError(null); setOpen(true); }}>
              + Crear tipo
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader
          title="Tipos de actividad"
          description="Los tipos de seed y requires_offer son inmutables una vez usados."
        />
        <div className="card-body">
          {types.error ? <Alert tone="error">{types.error}</Alert> : null}
          {types.loading ? <Spinner label="Cargando tipos…" /> : null}
          {!types.loading && (types.data?.activity_types.length ?? 0) === 0 ? (
            <EmptyState
              title="Sin tipos de actividad"
              description="No hay tipos registrados en la organización."
            />
          ) : null}
          {(types.data?.activity_types.length ?? 0) > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Requiere oferta</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {types.data?.activity_types.map((type) => (
                    <tr key={type.id}>
                      <td className="mono">{type.code}</td>
                      <td>{type.name}</td>
                      <td>
                        <Badge tone={type.requires_offer ? "warning" : "neutral"}>
                          {type.requires_offer ? "Sí" : "No"}
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          tone={type.is_active === false ? "danger" : "success"}
                        >
                          {type.is_active === false ? "Inactivo" : "Activo"}
                        </Badge>
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
        title="Crear activity type"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button
              type="button"
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
                document
                  .getElementById("activity-type-form")
                  ?.dispatchEvent(
                    new Event("submit", { bubbles: true, cancelable: true }),
                  );
              }}
            >
              {saving ? "Creando…" : "Crear tipo"}
            </Button>
          </>
        }
      >
        <form id="activity-type-form" className="stack" onSubmit={submit}>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Código" htmlFor="activity_type_code">
            <Input
              id="activity_type_code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="INSTALLATION"
              required
            />
          </Field>
          <Field label="Nombre" htmlFor="activity_type_name">
            <Input
              id="activity_type_name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <Field label="Descripción" htmlFor="activity_type_description">
            <Textarea
              id="activity_type_description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={requiresOffer}
              onChange={(event) => setRequiresOffer(event.target.checked)}
            />
            <span>
              <strong>requires_offer</strong>
              <br />
              <span className="muted text-xs">
                Exige una oferta publicada vigente.
              </span>
            </span>
          </label>
        </form>
      </Modal>
    </>
  );
}
