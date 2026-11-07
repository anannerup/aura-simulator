import { connection } from "next/server";
import { optionReferenceMarkdown } from "@/docs/agent-docs";
import { errorMessage } from "@/lib/errors";
import { loadOptionReference } from "@/server/agent-docs";
import { requestOrigin } from "@/server/request-origin";

/**
 * GET /docs/agents/options.md[?ref=<addon version>]: the option ↔ table reference of that addon version (default:
 * the server's) as Markdown, both directions. The first request for a version waits while it is generated.
 */
export async function GET(request: Request) {
  await connection();
  try {
    const reference = await loadOptionReference(new URL(request.url).searchParams.get("ref"));
    return new Response(optionReferenceMarkdown(requestOrigin(request.headers), reference), {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  } catch (e) {
    return new Response(`The option reference could not be generated: ${errorMessage(e)}\n`, { status: 503 });
  }
}
