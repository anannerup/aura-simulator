import { connection } from "next/server";
import { errorMessage } from "@/lib/errors";
import { loadOptionReference } from "@/server/agent-docs";

/**
 * GET /docs/agents/options.json[?ref=<addon version>]: the option ↔ table reference of that addon version (default:
 * the server's) as JSON (core's OptionReference). The first request for a version waits while it is generated
 * (about a minute); after that it is cached.
 */
export async function GET(request: Request) {
  await connection();
  try {
    const reference = await loadOptionReference(new URL(request.url).searchParams.get("ref"));
    return Response.json(reference);
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 503 });
  }
}
