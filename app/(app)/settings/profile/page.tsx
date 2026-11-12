"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/app/components/session-context";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Spinner,
} from "@/app/components/ui";
import { apiFetch, errorMessage } from "@/app/lib/api";
import { useApiData } from "@/app/lib/hooks";

interface OrganizationProfile {
  account: {
    display_name: string;
    email: string;
    theme: string;
    version: number;
  };
  organization: {
    name: string;
    legal_name: string;
    tax_id: string;
    contact_email: string;
    phone: string | null;
    timezone: string;
    version: number;
  };
}

export default function ProfilePage() {
  const session = useSession();
  const profile = useApiData<{ profile: OrganizationProfile }>(
    "/api/organization-profile",
  );
  const [displayName, setDisplayName] = useState(session.display_name);
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accountVersion, setAccountVersion] = useState(0);
  const [organizationVersion, setOrganizationVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const data = profile.data?.profile;
    if (!data) return;
    setDisplayName(data.account.display_name);
    setContactEmail(data.organization.contact_email);
    setPhone(data.organization.phone ?? "");
    setAccountVersion(data.account.version);
    setOrganizationVersion(data.organization.version);
  }, [profile.data]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const result = await apiFetch<{ profile: OrganizationProfile }>(
        "/api/organization-profile",
        {
          method: "PATCH",
          body: JSON.stringify({
            display_name: displayName.trim(),
            contact_email: contactEmail.trim().toLowerCase(),
            phone: phone.trim(),
            expectedVersion: accountVersion,
            expectedOrganizationVersion: organizationVersion,
          }),
        },
      );
      setAccountVersion(result.profile.account.version);
      setOrganizationVersion(result.profile.organization.version);
      setSaved(true);
      profile.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Profile"
        description="Cuenta y datos de contacto de la organización."
        actions={
          <Link href="/settings" className="btn btn-ghost btn-sm">
            Volver a Settings
          </Link>
        }
      />

      <div className="grid-2">
        <Card>
          <CardHeader
            title="Cuenta"
            description="Datos de la sesión ORGANIZATION."
          />
          <div className="card-body stack">
            {profile.loading ? <Spinner label="Cargando perfil…" /> : null}
            {profile.error ? <Alert tone="error">{profile.error}</Alert> : null}
            {error ? <Alert tone="error">{error}</Alert> : null}
            {saved ? <Alert tone="success">Perfil actualizado.</Alert> : null}
            <Field label="Nombre visible" htmlFor="profile_display_name">
              <Input
                id="profile_display_name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </Field>
            <Field label="Correo de la cuenta" htmlFor="profile_email">
              <Input
                id="profile_email"
                value={profile.data?.profile.account.email ?? session.email}
                disabled
              />
            </Field>
            <Field label="Correo de contacto" htmlFor="profile_contact_email">
              <Input
                id="profile_contact_email"
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                required
              />
            </Field>
            <Field label="Teléfono" htmlFor="profile_phone">
              <Input
                id="profile_phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
            <Button onClick={save} disabled={saving || profile.loading}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Organización" description="Datos legales de VERLA." />
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr>
                    <th>Nombre</th>
                    <td>{profile.data?.profile.organization.name ?? session.organization.name}</td>
                  </tr>
                  <tr>
                    <th>Razón social</th>
                    <td>{profile.data?.profile.organization.legal_name ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>NIT</th>
                    <td>{profile.data?.profile.organization.tax_id ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>Zona horaria</th>
                    <td>{profile.data?.profile.organization.timezone ?? session.organization.timezone}</td>
                  </tr>
                  <tr>
                    <th>Rol</th>
                    <td>Organización</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
