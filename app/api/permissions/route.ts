import { connection, NextResponse } from "next/server";

import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  handleList,
  permissionErrorResponse,
} from "@/backend/modules/permission/controllers/permission.controller";

export async function GET() {
  await connection();

  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await handleList(context));
  } catch (error) {
    return permissionErrorResponse(error);
  }
}
