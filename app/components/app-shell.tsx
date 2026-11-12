"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { initials, roleLabel } from "../lib/format";
import type { SessionUser } from "../lib/types";
import { Logo } from "./logo";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("verla-theme", next);
    } catch {
      // Theme persistence is optional.
    }
  }

  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
    >
      {theme === "dark" ? "☼" : "☾"}
    </button>
  );
}

export function AppShell({
  session,
  nav,
  children,
}: {
  session: SessionUser;
  nav: NavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function logout() {
    setLoggingOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/sign-in");
      router.refresh();
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Logo size="md" withTagline />
        </div>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "nav-link-active" : ""}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <strong>{session.organization.name}</strong>
          <br />
          {roleLabel(session.account_type)}
          <br />
          <span className="text-xs">{session.email}</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button mobile-menu-button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <div className="topbar-context">
              <strong>{session.organization.name}</strong>
              Portal de aliados
            </div>
          </div>

          <div className="topbar-right">
            <ThemeToggle />
            <Link href="/settings" className="user-chip">
              <span className="avatar">{initials(session.display_name)}</span>
              <span className="user-chip-copy">
                <strong>{session.display_name}</strong>
                <span>{roleLabel(session.account_type)}</span>
              </span>
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={logout}
              disabled={loggingOut}
            >
              {loggingOut ? "Saliendo…" : "Salir"}
            </button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
