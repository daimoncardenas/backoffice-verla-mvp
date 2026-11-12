import type { ReactNode } from "react";

export function Logo({
  size = "md",
  withTagline = false,
}: {
  size?: "sm" | "md" | "lg";
  withTagline?: boolean;
}) {
  return (
    <div className={`logo logo-${size}`}>
      <span className="logo-mark" aria-hidden="true">
        V
      </span>
      <span className="logo-copy">
        <span className="logo-text">VERLA</span>
        {withTagline ? (
          <span className="logo-sub">Red de aliados</span>
        ) : null}
      </span>
    </div>
  );
}

export function LogoSlot({ children }: { children: ReactNode }) {
  return <div className="logo-slot">{children}</div>;
}
