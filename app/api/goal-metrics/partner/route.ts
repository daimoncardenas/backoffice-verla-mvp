import { connection, NextResponse } from "next/server";

import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  goalMetricsErrorResponse,
  handlePartnerMetrics,
} from "@/backend/modules/goal-metrics/controllers/goal-metrics.controller";

export async function GET(request: Request) {
  await connection();

  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(
      await handlePartnerMetrics(
        context,
        new URL(request.url).searchParams,
      ),
    );
  } catch (error) {
    return goalMetricsErrorResponse(error);
  }
}
