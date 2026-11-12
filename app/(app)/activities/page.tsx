"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useSession } from "@/app/components/session-context";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Select,
  Spinner,
  StatCard,
} from "@/app/components/ui";
import { formatDateTime, statusLabel } from "@/app/lib/format";
import { useApiData } from "@/app/lib/hooks";
import { hasPermission } from "@/app/lib/permissions";
import type {
  Activity,
  ActivityType,
  Employee,
  Offer,
} from "@/app/lib/types";

function statusTone(status: string) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "CANCELLED") return "danger" as const;
  return "neutral" as const;
}

export default function ActivitiesPage() {
  const session = useSession();
  const canList = hasPermission(session.permissions, "ACTIVITY_LIST");
  const activities = useApiData<{ activities: Activity[] }>(
    canList ? "/api/activities" : null,
  );
  const employees = useApiData<{ employees: Employee[] }>(
    hasPermission(session.permissions, "EMPLOYEE_LIST")
      ? "/api/employees"
      : null,
  );
  const activityTypes = useApiData<{ activity_types: ActivityType[] }>(
    "/api/activity-types",
  );
  const offers = useApiData<{ offers: Offer[] }>("/api/offers");

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const employeeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const employee of employees.data?.employees ?? []) {
      map.set(employee.id, `${employee.first_name} ${employee.last_name}`);
    }
    return map;
  }, [employees.data]);

  const typeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const type of activityTypes.data?.activity_types ?? []) {
      map.set(type.id, type.code);
    }
    return map;
  }, [activityTypes.data]);

  const offerTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const offer of offers.data?.offers ?? []) {
      map.set(offer.id, offer.title);
    }
    return map;
  }, [offers.data]);

  const rows = useMemo(() => {
    return (activities.data?.activities ?? []).filter((activity) => {
      if (typeFilter && activity.activity_type_id !== typeFilter) return false;
      if (statusFilter && activity.status !== statusFilter) return false;
      return true;
    });
  }, [activities.data, typeFilter, statusFilter]);

  const completed = rows.filter((activity) => activity.status === "COMPLETED").length;
  const cancelled = rows.filter((activity) => activity.status === "CANCELLED").length;

  if (!canList) {
    return (
      <>
        <PageHeader title="Activities" />
        <Alert tone="error">
          Tu cuenta no tiene permiso ACTIVITY_LIST.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Activities"
        description="Actividades de todos los aliados, en orden descendente."
      />

      <div className="stat-grid">
        <StatCard label="Actividades" value={String(rows.length)} />
        <StatCard label="Completadas" value={String(completed)} />
        <StatCard label="Canceladas" value={String(cancelled)} />
        <StatCard
          label="Empleados únicos"
          value={String(
            new Set(
              (activities.data?.activities ?? []).map(
                (activity) => activity.employee_id,
              ),
            ).size,
          )}
          detail="Con actividad registrada"
        />
      </div>

      <Card>
        <CardHeader
          title="Registro de actividades"
          description="Detalle de ejecución por empleado, tipo y oferta."
        />
        <div className="card-body stack">
          <div className="form-grid">
            <Select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              aria-label="Filtrar por tipo"
            >
              <option value="">Todos los tipos</option>
              {(activityTypes.data?.activity_types ?? []).map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filtrar por estado"
            >
              <option value="">Todos los estados</option>
              <option value="COMPLETED">Completada</option>
              <option value="CANCELLED">Cancelada</option>
            </Select>
          </div>

          {activities.error ? <Alert tone="error">{activities.error}</Alert> : null}
          {activities.loading ? <Spinner label="Cargando actividades…" /> : null}
          {!activities.loading && rows.length === 0 ? (
            <EmptyState
              title="Sin actividades"
              description="No hay actividades que coincidan con los filtros."
            />
          ) : null}
          {rows.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Empleado</th>
                    <th>Tipo</th>
                    <th>Oferta</th>
                    <th>Estado</th>
                    <th aria-label="Detalle" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((activity) => (
                    <tr key={activity.id}>
                      <td>{formatDateTime(activity.performed_at)}</td>
                      <td>{employeeNames.get(activity.employee_id) ?? "—"}</td>
                      <td>{typeNames.get(activity.activity_type_id) ?? "—"}</td>
                      <td>
                        {activity.offer_snapshot?.title ??
                          (activity.offer_id
                            ? offerTitles.get(activity.offer_id) ?? "—"
                            : "—")}
                      </td>
                      <td>
                        <Badge tone={statusTone(activity.status)}>
                          {statusLabel(activity.status)}
                        </Badge>
                      </td>
                      <td>
                        <div className="row-actions">
                          <Link
                            href={`/activities/${activity.id}`}
                            className="btn btn-ghost btn-sm"
                          >
                            Ver
                          </Link>
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
    </>
  );
}
