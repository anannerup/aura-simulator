import { connection } from "next/server";
import { requestOrigin } from "@/server/request-origin";
import { loadAgentDocs } from "@/server/workspaces/docs";

/** GET /llms.txt: the agent docs as plain Markdown (same text as /docs/agents). */
export async function GET(request: Request) {
  await connection();
  return new Response(await loadAgentDocs(requestOrigin(request.headers)), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
