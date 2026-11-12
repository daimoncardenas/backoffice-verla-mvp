import { connection, NextResponse } from "next/server";

import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  dashboardErrorResponse,
  handleDashboard,
} from "@/backend/modules/dashboard/controllers/dashboard.controller";

export async function GET() {
  await connection();

  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await handleDashboard(context));
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
