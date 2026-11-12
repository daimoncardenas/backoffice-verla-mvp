"use client";

import { useSession } from "../../components/session-context";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Spinner,
} from "../../components/ui";
import { useApiData } from "../../lib/hooks";
import { hasPermission } from "../../lib/permissions";
import type { ActivityType } from "../../lib/types";

type BackofficeActivityType = ActivityType & { is_active?: boolean };

export default function ActivityTypesPage() {
  const session = useSession();
  const canList = hasPermission(
    session.permissions,
    "ACTIVITY_TYPE_LIST",
  );
  const types = useApiData<{ activity_types: BackofficeActivityType[] }>(
    canList ? "/api/activity-types" : null,
  );

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
        description="Catálogo de tipos de actividad y su exigencia de oferta."
      />

      <Card>
        <CardHeader
          title="Tipos de actividad"
          description="Catálogo de la organización."
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
    </>
  );
}
