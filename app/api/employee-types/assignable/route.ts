import { connection, NextResponse } from "next/server";

import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import {
  employeeTypeErrorResponse,
  handleListAssignable,
} from "@/backend/modules/employee-type/controllers/employee-type.controller";

export async function GET() {
  await connection();

  const context = await getSessionFromCookies();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await handleListAssignable(context));
  } catch (error) {
    return employeeTypeErrorResponse(error);
  }
}
