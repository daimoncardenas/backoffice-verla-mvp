import { connection, NextResponse } from "next/server";

import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  handleGet,
  permissionErrorResponse,
} from "@/backend/modules/permission/controllers/permission.controller";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  await connection();

  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    return NextResponse.json(await handleGet(context, id));
  } catch (error) {
    return permissionErrorResponse(error);
  }
}
