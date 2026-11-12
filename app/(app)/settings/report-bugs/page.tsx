"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Textarea,
} from "@/app/components/ui";

export default function ReportBugsPage() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [sent, setSent] = useState(false);
  const [reports, setReports] = useState<Array<{ subject: string; description: string; created_at: string }>>([]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReports((current) => [
      { subject: subject.trim(), description: description.trim(), created_at: new Date().toISOString() },
      ...current,
    ]);
    setSent(true);
    setSubject("");
    setDescription("");
  }

  return (
    <>
      <PageHeader
        title="Report / bugs"
        description="Reporte inicial de incidencias del backoffice."
        actions={
          <Link href="/settings" className="btn btn-ghost btn-sm">
            Volver a Settings
          </Link>
        }
      />

      <div className="grid-2">
        <Card>
          <CardHeader
            title="Nuevo reporte"
            description="El envío a un servicio de soporte queda pendiente de integración."
          />
          <div className="card-body">
            <form className="stack" onSubmit={submit}>
              <Field label="Asunto" htmlFor="bug_subject">
                <Input
                  id="bug_subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  required
                />
              </Field>
              <Field label="Descripción" htmlFor="bug_description">
                <Textarea
                  id="bug_description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  required
                />
              </Field>
              <Button type="submit">Registrar reporte</Button>
            </form>
          </div>
        </Card>

        <Card>
          <CardHeader title="Estado" description="Registro local de la demo." />
          <div className="card-body stack">
            {sent ? (
              <Alert tone="success">
                Reporte registrado localmente. El envío al sistema de soporte
                queda pendiente.
              </Alert>
            ) : (
              <p className="text-sm muted">
                Completa el formulario para registrar una incidencia en esta
                sesión.
              </p>
            )}
            <Alert tone="info">
              No existe una colección canónica de reportes en el modelo de 17
              colecciones. Este listado es local hasta definir su persistencia.
            </Alert>
            {reports.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Asunto</th>
                      <th>Descripción</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report, index) => (
                      <tr key={`${report.subject}-${index}`}>
                        <td>{report.subject}</td>
                        <td>{report.description}</td>
                        <td>{new Date(report.created_at).toLocaleString("es-CO")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </>
  );
}
