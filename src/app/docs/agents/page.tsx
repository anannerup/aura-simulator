import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Markdown } from "@/docs/Markdown";
import { requestOrigin } from "@/server/request-origin";
import { loadAgentDocs } from "@/server/workspaces/docs";
import styles from "./docs.module.css";

export const metadata: Metadata = { title: "Agent docs · Aura Simulator" };

async function Docs() {
  const markdown = await loadAgentDocs(requestOrigin(await headers()));
  return <Markdown source={markdown} />;
}

/** /docs/agents: the agent docs for people; the same text is plain Markdown at /docs/agents.md and /llms.txt. */
export default function AgentDocsPage() {
  return (
    <main className={styles.docs}>
      <p className={styles.alt}>
        Plain Markdown for agents: <a href="/llms.txt">/llms.txt</a> (same as <a href="/docs/agents.md">/docs/agents.md</a>)
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <Docs />
      </Suspense>
    </main>
  );
}
