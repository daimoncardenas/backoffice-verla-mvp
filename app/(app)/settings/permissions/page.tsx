"use client";

import { useState, type FormEvent } from "react";

import { useSession } from "@/app/components/session-context";
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
} from "@/app/components/ui";
import { apiFetch, errorMessage } from "@/app/lib/api";
import { useApiData } from "@/app/lib/hooks";
import { hasPermission } from "@/app/lib/permissions";
import type { Permission } from "@/app/lib/types";

export default function PermissionsPage() {
  const session = useSession();
  const canList = hasPermission(session.permissions, "PERMISSION_LIST");
  const canCreate = hasPermission(session.permissions, "PERMISSION_CREATE");
  const permissions = useApiData<{ permissions: Permission[] }>(
    canList ? "/api/permissions" : null,
  );

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await apiFetch("/api/permissions", {
        method: "POST",
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          resource: resource.trim().toUpperCase(),
          action: action.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      setOpen(false);
      setCode("");
      setResource("");
      setAction("");
      setName("");
      setDescription("");
      permissions.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (!canList) {
    return (
      <>
        <PageHeader title="Permissions" />
        <Alert tone="error">
          Tu cuenta no tiene permiso PERMISSION_LIST.
        </Alert>
      </>
    );
  }

  const rows = permissions.data?.permissions ?? [];

  return (
    <>
      <PageHeader
        title="Permissions"
        description="Catálogo de permisos de la organización."
        actions={
          canCreate ? (
            <Button onClick={() => { setError(null); setOpen(true); }}>
              + Crear permiso
            </Button>
          ) : undefined
        }
      />

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Permisos</span>
          <strong className="stat-value">{rows.length}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Recursos</span>
          <strong className="stat-value">
            {new Set(rows.map((permission) => permission.resource)).size}
          </strong>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Catálogo efectivo"
          description="Los permisos nuevos quedan disponibles para roles y empleados."
        />
        <div className="card-body">
          {permissions.error ? (
            <Alert tone="error">{permissions.error}</Alert>
          ) : null}
          {permissions.loading ? <Spinner label="Cargando permisos…" /> : null}
          {!permissions.loading && rows.length === 0 ? (
            <EmptyState
              title="Sin permisos"
              description="No hay permisos registrados en la organización."
            />
          ) : null}
          {rows.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Recurso</th>
                    <th>Acción</th>
                    <th>Nombre</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((permission) => (
                    <tr key={permission.id}>
                      <td className="mono">{permission.code}</td>
                      <td>{permission.resource}</td>
                      <td>{permission.action}</td>
                      <td>{permission.name}</td>
                      <td>
                        <Badge tone={permission.is_active ? "success" : "danger"}>
                          {permission.is_active ? "Activo" : "Inactivo"}
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
        title="Crear permiso"
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
                  .getElementById("permission-form")
                  ?.dispatchEvent(
                    new Event("submit", { bubbles: true, cancelable: true }),
                  );
              }}
            >
              {saving ? "Creando…" : "Crear permiso"}
            </Button>
          </>
        }
      >
        <form id="permission-form" className="stack" onSubmit={submit}>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Código" htmlFor="permission_code">
            <Input
              id="permission_code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="OFFER_CHAT_CREATE"
              required
            />
          </Field>
          <div className="form-grid">
            <Field label="Recurso" htmlFor="permission_resource">
              <Input
                id="permission_resource"
                value={resource}
                onChange={(event) => setResource(event.target.value)}
                placeholder="OFFER_CHAT"
                required
              />
            </Field>
            <Field label="Acción" htmlFor="permission_action">
              <Input
                id="permission_action"
                value={action}
                onChange={(event) => setAction(event.target.value)}
                placeholder="CREATE"
                required
              />
            </Field>
          </div>
          <Field label="Nombre" htmlFor="permission_name">
            <Input
              id="permission_name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <Field label="Descripción" htmlFor="permission_description">
            <Textarea
              id="permission_description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
