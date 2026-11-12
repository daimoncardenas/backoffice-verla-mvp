import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getSessionFromCookies } from "@/backend/modules/auth/services/session.service";

import { Logo } from "../components/logo";
import { ThreeLogo } from "../components/three-logo";
import { SignInForm } from "./sign-in-form";

export const instant = false;

export default async function SignInPage() {
  await connection();

  const session = await getSessionFromCookies();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="signin-page">
      <section className="signin-visual">
        <ThreeLogo />
        <div className="signin-visual-top">
          <Logo size="lg" withTagline />
        </div>

        <div className="signin-visual-copy">
          <p className="eyebrow">Conectividad que impulsa tu red</p>
          <h1>
            Gestiona tu equipo.
            <br />
            <span>Convierte cada meta.</span>
          </h1>
          <p>
            Actividades, metas y ofertas de VERLA en un solo lugar. Tu operación
            diaria, clara y conectada.
          </p>
        </div>

        <div className="signin-visual-foot">
          <span>Internet hogar</span>
          <span>Fibra óptica</span>
          <span>Red de aliados</span>
        </div>
      </section>

      <section className="signin-panel">
        <div className="signin-card">
          <Logo size="md" withTagline />
          <h2>Bienvenido de nuevo</h2>
          <p className="signin-sub">
            Ingresa con tu cuenta de aliado o empleado para continuar.
          </p>

          <SignInForm />

          <p className="signin-meta">
            Las cuentas de organización pertenecen al backoffice de VERLA y no
            pueden ingresar a este portal.
          </p>
        </div>
      </section>
    </main>
  );
}
