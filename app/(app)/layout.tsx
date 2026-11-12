import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";
import { serializeSessionWithPermissions } from "@/backend/modules/auth/services/session.service";
import { hasPermission } from "@/app/lib/permissions";
import type { SessionUser } from "@/app/lib/types";

import { AppShell, type NavItem } from "../components/app-shell";
import { SessionProvider } from "../components/session-context";

export const instant = false;

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();

  const context = await getSessionFromCookies();

  if (!context) {
    redirect("/sign-in");
  }

  if (context.account_type !== "ORGANIZATION") {
    redirect("/sign-in");
  }

  const session = (await serializeSessionWithPermissions(
    context,
  )) as SessionUser;
  const permissions = session.permissions;
  const nav: NavItem[] = [];

  if (hasPermission(permissions, "DASHBOARD_READ")) {
    nav.push({ href: "/dashboard", label: "Dashboard", icon: "▦" });
  }

  if (hasPermission(permissions, "PARTNER_LIST")) {
    nav.push({ href: "/partners", label: "Partners", icon: "◆" });
  }

  if (hasPermission(permissions, "ACTIVITY_LIST")) {
    nav.push({ href: "/activities", label: "Activities", icon: "◉" });
  }

  if (hasPermission(permissions, "OFFER_LIST")) {
    nav.push({ href: "/offers", label: "Ofertas", icon: "◇" });
  }

  if (hasPermission(permissions, "PROFILE_READ")) {
    nav.push({ href: "/settings", label: "Settings", icon: "⚙" });
  }

  return (
    <SessionProvider user={session}>
      <AppShell session={session} nav={nav}>
        {children}
      </AppShell>
    </SessionProvider>
  );
}
