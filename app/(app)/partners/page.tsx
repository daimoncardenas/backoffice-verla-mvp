"use client";

import { useState, type FormEvent } from "react";

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
} from "../../components/ui";
import { apiFetch, errorMessage } from "../../lib/api";
import { statusLabel } from "../../lib/format";
import { useApiData } from "../../lib/hooks";
import { hasPermission } from "../../lib/permissions";
import type { Partner } from "../../lib/types";

function statusTone(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "BLOCKED") return "danger" as const;
  return "warning" as const;
}

export default function PartnersPage() {
  const session = useSession();
  const canList = hasPermission(session.permissions, "PARTNER_LIST");
  const canCreate = hasPermission(session.permissions, "PARTNER_CREATE");
  const partners = useApiData<{ partners: Partner[] }>(
    canList ? "/api/partners" : null,
  );

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [documentType, setDocumentType] = useState("NIT");
  const [documentNumber, setDocumentNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await apiFetch("/api/partners", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          legal_name: legalName.trim(),
          document_type: documentType,
          document_number: documentNumber.trim(),
          contact_name: contactName.trim(),
          contact_email: contactEmail.trim().toLowerCase(),
          phone: phone.trim(),
        }),
      });
      setOpen(false);
      setName("");
      setLegalName("");
      setDocumentNumber("");
      setContactName("");
      setContactEmail("");
      setPhone("");
      partners.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (!canList) {
    return (
      <>
        <PageHeader title="Partners" />
        <Alert tone="error">
          Tu cuenta no tiene permiso PARTNER_LIST para consultar aliados.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Partners"
        description="Red de aliados de VERLA: datos de contacto, estado y documento."
        actions={
          canCreate ? (
            <Button onClick={() => { setError(null); setOpen(true); }}>
              + Crear partner
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader
          title="Aliados registrados"
          description="Los aliados creados quedan activos y habilitados con los permisos del catálogo."
        />
        <div className="card-body">
          {partners.error ? <Alert tone="error">{partners.error}</Alert> : null}
          {partners.loading ? <Spinner label="Cargando aliados…" /> : null}
          {!partners.loading && (partners.data?.partners.length ?? 0) === 0 ? (
            <EmptyState
              title="Sin aliados"
              description="Crea el primer aliado para conectarlo a la red."
              action={
                canCreate ? (
                  <Button size="sm" onClick={() => setOpen(true)}>
                    Crear partner
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {(partners.data?.partners.length ?? 0) > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Documento</th>
                    <th>Correo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.data?.partners.map((partner) => (
                    <tr key={partner.id}>
                      <td>
                        <div className="cell-stack">
                          <strong>{partner.name}</strong>
                          <span>{partner.legal_name}</span>
                        </div>
                      </td>
                      <td>
                        {partner.document_type} {partner.document_number}
                      </td>
                      <td>{partner.contact_email}</td>
                      <td>
                        <Badge tone={statusTone(partner.status)}>
                          {statusLabel(partner.status)}
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
        title="Crear partner"
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
                const form = document.getElementById("partner-form");
                form?.dispatchEvent(
                  new Event("submit", { bubbles: true, cancelable: true }),
                );
              }}
            >
              {saving ? "Creando…" : "Crear partner"}
            </Button>
          </>
        }
      >
        <form id="partner-form" className="stack" onSubmit={submit}>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="form-grid">
            <Field label="Nombre comercial" htmlFor="partner_name">
              <Input
                id="partner_name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field label="Razón social" htmlFor="partner_legal_name">
              <Input
                id="partner_legal_name"
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
                required
              />
            </Field>
            <Field label="Tipo de documento" htmlFor="partner_document_type">
              <Select
                id="partner_document_type"
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
              >
                <option value="NIT">NIT</option>
                <option value="CC">CC</option>
                <option value="CE">CE</option>
              </Select>
            </Field>
            <Field label="Número de documento" htmlFor="partner_document_number">
              <Input
                id="partner_document_number"
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                required
              />
            </Field>
            <Field label="Contacto" htmlFor="partner_contact_name">
              <Input
                id="partner_contact_name"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                required
              />
            </Field>
            <Field label="Correo de contacto" htmlFor="partner_contact_email">
              <Input
                id="partner_contact_email"
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                required
              />
            </Field>
            <Field label="Teléfono" htmlFor="partner_phone">
              <Input
                id="partner_phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
