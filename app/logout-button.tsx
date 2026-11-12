"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });

      if (!response.ok) {
        setError("No se pudo cerrar la sesión.");
        return;
      }

      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("No se pudo cerrar la sesión.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handleLogout} disabled={isSubmitting}>
        {isSubmitting ? "Cerrando…" : "Cerrar sesión"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
