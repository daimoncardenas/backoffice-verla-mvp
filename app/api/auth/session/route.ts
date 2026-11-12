import { connection, NextResponse } from "next/server";

import {
  getSessionFromCookies,
  serializeSessionWithPermissions,
} from "@/backend/modules/auth/services/session.service";

export async function GET() {
  await connection();

  try {
    const context = await getSessionFromCookies();

    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      user: await serializeSessionWithPermissions(context),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
