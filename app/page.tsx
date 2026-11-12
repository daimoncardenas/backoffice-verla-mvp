import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";

export const instant = false;

export default async function Home() {
  await connection();

  const session = await getSessionFromCookies();

  redirect(session ? "/dashboard" : "/sign-in");
}
