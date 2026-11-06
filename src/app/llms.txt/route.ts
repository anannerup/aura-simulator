import { connection, type NextRequest } from "next/server";
import { loadAgentDocs } from "@/server/workspaces/docs";

/** GET /llms.txt: the agent docs as plain Markdown (same text as /docs/agents). */
export async function GET(request: NextRequest) {
  await connection();
  return new Response(await loadAgentDocs(request.nextUrl.origin), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
