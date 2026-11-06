import type { NextRequest } from "next/server";
import { encodeBundle, looksLikeStateCode } from "@/workspace";
import { getShortLinks } from "@/server/workspaces";

const MAX_CODE_CHARS = 2_000_000;

/**
 * POST /api/short-links with `{code}` (one state code) or `{codes: [...]}` (a workspace bundle: the codes of
 * several top-level items) → `{id, url}`. The same content always gets the same ID.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Send JSON {"code": "!WA:2!..."} or {"codes": ["!WA:2!...", ...]}' }, { status: 400 });
  }
  const b = (body ?? {}) as { code?: unknown; codes?: unknown };
  const codes = Array.isArray(b.codes) ? b.codes : typeof b.code === "string" ? [b.code] : null;
  if (!codes || codes.length === 0 || !codes.every((c) => typeof c === "string" && looksLikeStateCode(c))) {
    return Response.json({ error: "`code` must be a state code (!WA:2!...), or `codes` a list of them" }, { status: 400 });
  }
  const text = encodeBundle(codes as string[]);
  if (text.length > MAX_CODE_CHARS) return Response.json({ error: "State code too long" }, { status: 413 });
  const id = getShortLinks().put(text);
  return Response.json({ id, url: `${request.nextUrl.origin}/?s=${id}` });
}
