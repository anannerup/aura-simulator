/**
 * The origin the client used to reach this server (`https://example.org`), for links written into responses.
 * Reads `X-Forwarded-Host`/`-Proto` (a reverse proxy's, else the ones Next.js fills from the Host header and socket),
 * not `request.nextUrl.origin`, which is the server's own listen address.
 */
export function requestOrigin(headers: Pick<Headers, "get">): string {
  const host = first(headers.get("x-forwarded-host")) ?? headers.get("host") ?? "localhost";
  const proto = first(headers.get("x-forwarded-proto")) ?? "http";
  return `${proto}://${host}`;
}

/** The first entry of a forwarded header (each proxy hop may append one). */
function first(value: string | null): string | undefined {
  return value?.split(",")[0].trim() || undefined;
}
