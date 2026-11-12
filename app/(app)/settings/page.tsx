import Link from "next/link";

import { PageHeader } from "@/app/components/ui";

const sections = [
  {
    href: "/settings/profile",
    title: "Profile",
    description: "Datos de la cuenta y de la organización.",
    icon: "◉",
  },
  {
    href: "/settings/ai-search",
    title: "AI search",
    description: "search_enabled, búsqueda y frequency_days.",
    icon: "◎",
  },
  {
    href: "/settings/activity-types",
    title: "Activity types",
    description: "Catálogo de tipos de actividad.",
    icon: "▤",
  },
  {
    href: "/settings/permissions",
    title: "Permissions",
    description: "Permisos efectivos de la cuenta ORGANIZATION.",
    icon: "◆",
  },
  // Report / bugs is hidden until a canonical support destination exists.
  // {
  //   href: "/settings/report-bugs",
  //   title: "Report / bugs",
  //   description: "Reporte inicial de incidencias del backoffice.",
  //   icon: "!",
  // },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Configuración de la organización y catálogos."
      />

      <div className="grid-3">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="card settings-card">
            <div className="card-body stack-sm">
              <span className="settings-icon" aria-hidden="true">
                {section.icon}
              </span>
              <h2 className="card-title">{section.title}</h2>
              <p className="card-description">{section.description}</p>
              <span className="text-xs muted">Abrir sección →</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
