"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import {
  Alert,
  Badge,
  Card,
  CardHeader,
  PageHeader,
  Spinner,
} from "@/app/components/ui";
import { formatDateTime, statusLabel } from "@/app/lib/format";
import { useApiData } from "@/app/lib/hooks";
import type {
  Activity,
  ActivityType,
  City,
  Employee,
  Offer,
} from "@/app/lib/types";

export default function ActivityDetailPage() {
  const params = useParams<{ id: string }>();
  const activity = useApiData<{ activity: Activity }>(
    `/api/activities/${params.id}`,
  );
  const employees = useApiData<{ employees: Employee[] }>("/api/employees");
  const types = useApiData<{ activity_types: ActivityType[] }>(
    "/api/activity-types",
  );
  const cities = useApiData<{ cities: City[] }>("/api/cities");
  const offers = useApiData<{ offers: Offer[] }>("/api/offers");

  const employeeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const employee of employees.data?.employees ?? []) {
      map.set(employee.id, `${employee.first_name} ${employee.last_name}`);
    }
    return map;
  }, [employees.data]);
  const typeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const type of types.data?.activity_types ?? []) {
      map.set(type.id, type.code);
    }
    return map;
  }, [types.data]);
  const cityNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const city of cities.data?.cities ?? []) {
      map.set(city.id, city.name);
    }
    return map;
  }, [cities.data]);
  const offerTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const offer of offers.data?.offers ?? []) {
      map.set(offer.id, offer.title);
    }
    return map;
  }, [offers.data]);

  const record = activity.data?.activity;

  if (activity.loading && !record) {
    return <Spinner label="Cargando actividad…" />;
  }

  if (activity.error || !record) {
    return (
      <>
        <PageHeader title="Activity" />
        <Alert tone="error">
          {activity.error ?? "La actividad no existe o está fuera del alcance."}
        </Alert>
        <Link href="/activities" className="btn btn-ghost">
          Volver a Activities
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Activity"
        description={`${typeNames.get(record.activity_type_id) ?? "Actividad"} · ${formatDateTime(record.performed_at)}`}
        actions={
          <Link href="/activities" className="btn btn-ghost">
            Volver
          </Link>
        }
      />

      <div className="flex wrap">
        <Badge tone={record.status === "COMPLETED" ? "success" : "danger"}>
          {statusLabel(record.status)}
        </Badge>
        <span className="text-xs muted">Versión {record.version}</span>
      </div>

      <div className="grid-2">
        <Card>
          <CardHeader title="Detalle" description="Datos de la actividad." />
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr>
                    <th>Título</th>
                    <td>{record.title}</td>
                  </tr>
                  <tr>
                    <th>Descripción</th>
                    <td>{record.description ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>Empleado</th>
                    <td>{employeeNames.get(record.employee_id) ?? record.employee_id}</td>
                  </tr>
                  <tr>
                    <th>Ciudad</th>
                    <td>{cityNames.get(record.city_id) ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>Ejecutada</th>
                    <td>{formatDateTime(record.performed_at)}</td>
                  </tr>
                  <tr>
                    <th>Registrada</th>
                    <td>{formatDateTime(record.created_at)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Oferta" description="Snapshot al momento de la venta." />
          <div className="card-body stack">
            {record.offer_snapshot ? (
              <>
                <strong>{record.offer_snapshot.title}</strong>
                <p className="text-sm muted">
                  {formatDateTime(record.offer_snapshot.starts_at)} —{" "}
                  {formatDateTime(record.offer_snapshot.ends_at)}
                </p>
              </>
            ) : record.offer_id ? (
              <p className="text-sm muted">
                {offerTitles.get(record.offer_id) ?? record.offer_id}
              </p>
            ) : (
              <p className="text-sm muted">Sin oferta asociada.</p>
            )}
            {record.status === "CANCELLED" ? (
              <Alert tone="warning">
                Cancelada: {record.cancellation_reason ?? "sin motivo registrado"}
              </Alert>
            ) : null}
          </div>
        </Card>
      </div>
    </>
  );
}
