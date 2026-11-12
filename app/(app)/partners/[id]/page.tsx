"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Spinner,
  Tabs,
} from "@/app/components/ui";
import { formatDate, statusLabel } from "@/app/lib/format";
import { useApiData } from "@/app/lib/hooks";
import type {
  Employee,
  EmployeeType,
  Goal,
  Partner,
} from "@/app/lib/types";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "employees", label: "Employees" },
  { id: "goals", label: "Goals" },
  { id: "metrics", label: "Metrics" },
];

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState("profile");

  const partners = useApiData<{ partners: Partner[] }>("/api/partners");
  const employees = useApiData<{ employees: Employee[] }>("/api/employees");
  const goals = useApiData<{ goals: Goal[] }>("/api/goals");
  const employeeTypes = useApiData<{ employee_types: EmployeeType[] }>(
    "/api/employee-types",
  );

  const partner = partners.data?.partners.find(
    (item) => item.id === params.id,
  );
  const partnerEmployees = useMemo(
    () =>
      (employees.data?.employees ?? []).filter(
        (employee) => employee.partner_id === params.id,
      ),
    [employees.data, params.id],
  );
  const partnerGoals = useMemo(
    () =>
      (goals.data?.goals ?? []).filter(
        (goal) => goal.partner_id === params.id,
      ),
    [goals.data, params.id],
  );
  const typeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const type of employeeTypes.data?.employee_types ?? []) {
      map.set(type.id, type.code);
    }
    return map;
  }, [employeeTypes.data]);

  if (partners.loading && !partner) {
    return <Spinner label="Cargando aliado…" />;
  }

  if (!partner) {
    return (
      <>
        <PageHeader title="Partner" />
        <Alert tone="error">El aliado no existe o está fuera del alcance.</Alert>
        <Link href="/partners" className="btn btn-ghost">
          Volver a Partners
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={partner.name}
        description={`${partner.legal_name} · ${partner.document_type} ${partner.document_number}`}
        actions={
          <>
            <Badge tone={partner.status === "ACTIVE" ? "success" : "warning"}>
              {statusLabel(partner.status)}
            </Badge>
            <Button variant="secondary" disabled title="Próximamente">
              Editar (próximamente)
            </Button>
            <Link href="/partners" className="btn btn-ghost">
              Volver
            </Link>
          </>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "profile" ? (
        <Card>
          <CardHeader title="Profile" description="Datos del aliado." />
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr>
                    <th>Nombre</th>
                    <td>{partner.name}</td>
                  </tr>
                  <tr>
                    <th>Razón social</th>
                    <td>{partner.legal_name}</td>
                  </tr>
                  <tr>
                    <th>Documento</th>
                    <td>
                      {partner.document_type} {partner.document_number}
                    </td>
                  </tr>
                  <tr>
                    <th>Contacto</th>
                    <td>{partner.contact_name}</td>
                  </tr>
                  <tr>
                    <th>Correo</th>
                    <td>{partner.contact_email}</td>
                  </tr>
                  <tr>
                    <th>Teléfono</th>
                    <td>{partner.phone}</td>
                  </tr>
                  <tr>
                    <th>Dirección</th>
                    <td>{partner.address ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>Creado</th>
                    <td>{formatDate(partner.created_at)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "employees" ? (
        <Card>
          <CardHeader
            title="Employees"
            description="Empleados del aliado."
            actions={
              <Button size="sm" variant="secondary" disabled title="Próximamente">
                Editar (próximamente)
              </Button>
            }
          />
          <div className="card-body">
            {employees.loading ? <Spinner label="Cargando empleados…" /> : null}
            {partnerEmployees.length === 0 ? (
              <EmptyState
                title="Sin empleados"
                description="Este aliado aún no tiene empleados registrados."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Rol</th>
                      <th>Correo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partnerEmployees.map((employee) => (
                      <tr key={employee.id}>
                        <td>
                          {employee.first_name} {employee.last_name}
                        </td>
                        <td>
                          {typeNames.get(employee.employee_type_id) ?? "—"}
                        </td>
                        <td>{employee.email}</td>
                        <td>
                          <Badge
                            tone={
                              employee.status === "ACTIVE" ? "success" : "warning"
                            }
                          >
                            {statusLabel(employee.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {tab === "goals" ? (
        <Card>
          <CardHeader
            title="Goals"
            description="Metas del aliado."
            actions={
              <Button size="sm" variant="secondary" disabled title="Próximamente">
                Editar (próximamente)
              </Button>
            }
          />
          <div className="card-body">
            {goals.loading ? <Spinner label="Cargando metas…" /> : null}
            {partnerGoals.length === 0 ? (
              <EmptyState
                title="Sin metas"
                description="Este aliado aún no tiene metas registradas."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Meta</th>
                      <th>Código</th>
                      <th>Agregación</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partnerGoals.map((goal) => (
                      <tr key={goal.id}>
                        <td>{goal.name}</td>
                        <td className="mono">{goal.code}</td>
                        <td>{goal.aggregation}</td>
                        <td>
                          <Badge tone={goal.is_active ? "success" : "warning"}>
                            {goal.is_active ? "Activa" : "Inactiva"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {tab === "metrics" ? (
        <Card>
          <CardHeader
            title="Metrics"
            description="Consolidado del aliado."
          />
          <div className="card-body stack">
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Empleados</span>
                <strong className="stat-value">{partnerEmployees.length}</strong>
              </div>
              <div className="stat-card">
                <span className="stat-label">Metas</span>
                <strong className="stat-value">{partnerGoals.length}</strong>
              </div>
            </div>
            <Alert tone="info">
              El detalle de métricas por meta y periodo se conectará al endpoint
              de consolidados. Esta vista inicial muestra los conteos disponibles.
            </Alert>
          </div>
        </Card>
      ) : null}
    </>
  );
}
