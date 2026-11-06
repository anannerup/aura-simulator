import type { NextRequest } from "next/server";
import { looksLikeStateCode } from "@/workspace";
import { getShortLinks } from "@/server/workspaces";

const MAX_CODE_CHARS = 2_000_000;

/** POST /api/short-links with `{code}` → `{id, url}`. The same code always gets the same ID. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Send JSON {"code": "!WA:2!..."}' }, { status: 400 });
  }
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !looksLikeStateCode(code)) {
    return Response.json({ error: "`code` must be a state code (!WA:2!...)" }, { status: 400 });
  }
  if (code.length > MAX_CODE_CHARS) return Response.json({ error: "State code too long" }, { status: 413 });
  const id = getShortLinks().put(code.trim());
  return Response.json({ id, url: `${request.nextUrl.origin}/?s=${id}` });
}
