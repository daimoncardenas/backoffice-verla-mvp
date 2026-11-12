import { connection, NextResponse } from "next/server";

import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  activityTypeErrorResponse,
  handleList,
} from "@/backend/modules/activity-type/controllers/activity-type.controller";

export async function GET(_request: Request) {
  await connection();

  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await handleList(context));
  } catch (error) {
    return activityTypeErrorResponse(error);
  }
}
