"use client";

import { useMemo } from "react";

import { useSession } from "../../components/session-context";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Spinner,
  StatCard,
} from "../../components/ui";
import { formatDate, statusLabel } from "../../lib/format";
import { useApiData } from "../../lib/hooks";
import { hasPermission } from "../../lib/permissions";
import type { Offer, Partner } from "../../lib/types";

export default function DashboardPage() {
  const session = useSession();
  const canPartners = hasPermission(session.permissions, "PARTNER_LIST");
  const canOffers = hasPermission(session.permissions, "OFFER_LIST");
  const partners = useApiData<{ partners: Partner[] }>(
    canPartners ? "/api/partners" : null,
  );
  const offers = useApiData<{ offers: Offer[] }>(
    canOffers ? "/api/offers" : null,
  );

  const partnerList = partners.data?.partners ?? [];
  const offerList = offers.data?.offers ?? [];
  const activePartners = partnerList.filter(
    (partner) => partner.status === "ACTIVE",
  ).length;
  const publishedOffers = useMemo(
    () => offerList.filter((offer) => offer.status === "PUBLISHED"),
    [offerList],
  );
  const latestOffer = publishedOffers[0] ?? offerList[0] ?? null;
  const otherOffers = offerList.filter(
    (offer) => offer.id !== latestOffer?.id,
  ).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen operativo de la organización, aliados y ofertas."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              partners.reload();
              offers.reload();
            }}
            disabled={partners.loading || offers.loading}
          >
            {partners.loading || offers.loading ? "Actualizando…" : "Actualizar"}
          </Button>
        }
      />

      {partners.error ? <Alert tone="error">{partners.error}</Alert> : null}
      {offers.error ? <Alert tone="error">{offers.error}</Alert> : null}

      <div className="stat-grid">
        <StatCard
          label="Aliados"
          value={partners.loading ? "…" : String(partnerList.length)}
          detail="Red registrada"
        />
        <StatCard
          label="Aliados activos"
          value={partners.loading ? "…" : String(activePartners)}
          detail="Operando actualmente"
        />
        <StatCard
          label="Ofertas"
          value={offers.loading ? "…" : String(offerList.length)}
          detail="Todos los estados"
        />
        <StatCard
          label="Ofertas publicadas"
          value={offers.loading ? "…" : String(publishedOffers.length)}
          detail="Visibles para la red"
        />
      </div>

      <div className="grid-2">
        <Card>
          <CardHeader
            title="Última oferta"
            description="Oferta publicada más reciente de la organización."
          />
          <div className="card-body">
            {offers.loading ? (
              <Spinner label="Cargando ofertas…" />
            ) : latestOffer ? (
              <div className="offer-card">
                <div className="offer-media">
                  {latestOffer.images[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={latestOffer.images[0].url}
                      alt={latestOffer.images[0].alt_text}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    "Oferta VERLA"
                  )}
                </div>
                <div className="flex-between">
                  <h3>{latestOffer.title}</h3>
                  <Badge
                    tone={
                      latestOffer.status === "PUBLISHED"
                        ? "success"
                        : "warning"
                    }
                  >
                    {statusLabel(latestOffer.status ?? "DRAFT")}
                  </Badge>
                </div>
                <p className="text-sm muted">{latestOffer.content}</p>
                <p className="text-xs muted">
                  Vigencia: {formatDate(latestOffer.starts_at)} —{" "}
                  {formatDate(latestOffer.ends_at)}
                </p>
              </div>
            ) : (
              <EmptyState
                title="Sin ofertas"
                description="Crea una oferta desde el módulo Ofertas para verla aquí."
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Ofertas anteriores"
            description="Últimas ofertas de la organización."
          />
          <div className="card-body">
            {otherOffers.length > 0 ? (
              <div className="offer-list">
                {otherOffers.map((offer) => (
                  <div key={offer.id} className="offer-row">
                    <div>
                      <strong>{offer.title}</strong>
                      <div className="text-xs muted">
                        {formatDate(offer.starts_at)} — {formatDate(offer.ends_at)}
                      </div>
                    </div>
                    <Badge tone="info">
                      {statusLabel(offer.status ?? "DRAFT")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sin ofertas anteriores"
                description="Aún no hay otras ofertas registradas."
              />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
