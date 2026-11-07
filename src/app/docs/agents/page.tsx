import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Markdown } from "@/docs/Markdown";
import { requestOrigin } from "@/server/request-origin";
import { loadAgentDocs } from "@/server/agent-docs";
import styles from "./docs.module.css";

export const metadata: Metadata = { title: "Agent docs · Aura Simulator" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function Docs({ searchParams }: { searchParams: SearchParams }) {
  const { ref } = await searchParams;
  const markdown = await loadAgentDocs(requestOrigin(await headers()), typeof ref === "string" ? ref : null);
  return <Markdown source={markdown} />;
}

/**
 * /docs/agents[?ref=<addon version>]: the agent docs for people; the same text is plain Markdown at
 * /docs/agents.md and /llms.txt.
 */
export default function AgentDocsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.docs}>
      <p className={styles.alt}>
        Plain Markdown for agents: <a href="/llms.txt">/llms.txt</a> (same as <a href="/docs/agents.md">/docs/agents.md</a>)
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <Docs searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
