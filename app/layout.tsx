import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "VERLA · Portal de aliados",
  description:
    "Portal de aliados y empleados de VERLA: metas, actividades y ofertas.",
};

const THEME_SCRIPT = `
try {
  var saved = localStorage.getItem("verla-theme");
  document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
} catch (error) {
  document.documentElement.dataset.theme = "dark";
}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
