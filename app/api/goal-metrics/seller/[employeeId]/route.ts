import { connection, NextResponse } from "next/server";

import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  goalMetricsErrorResponse,
  handleSellerMetrics,
} from "@/backend/modules/goal-metrics/controllers/goal-metrics.controller";

interface RouteContext {
  params: Promise<{ employeeId: string }>;
}

export async function GET(
  request: Request,
  { params }: RouteContext,
) {
  await connection();

  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { employeeId } = await params;

  try {
    return NextResponse.json(
      await handleSellerMetrics(
        context,
        employeeId,
        new URL(request.url).searchParams,
      ),
    );
  } catch (error) {
    return goalMetricsErrorResponse(error);
  }
}
