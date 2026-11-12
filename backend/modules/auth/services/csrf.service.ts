import "server-only";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");

  if (!origin) {
    throw new Error("Missing Origin header");
  }

  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    ""
  )
    .split(",")[0]
    .trim();

  const protocol = (
    request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.replace(":", "")
  )
    .split(",")[0]
    .trim();

  if (!host) {
    throw new Error("Missing Host header");
  }

  const expectedOrigin = `${protocol}://${host}`;

  if (origin !== expectedOrigin) {
    throw new Error("Cross-origin request rejected");
  }
}
