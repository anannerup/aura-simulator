import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { findServerGame } from "@/games/server";
import type { ServerGame } from "@/server/game";
import { requestOrigin } from "@/server/request-origin";
import { Markdown } from "./Markdown";
import styles from "./docs.module.css";

export const metadata: Metadata = { title: "Agent docs · Aura Simulator" };

type Props = PageProps<"/[game]/docs/agents">;

async function Docs({ params, searchParams }: Props) {
  const server: ServerGame = findServerGame((await params).game)!; // the layout answers 404 for other ids
  const id = server.game.id;
  const { ref } = await searchParams;
  const markdown = await server.agentDocs(requestOrigin(await headers()), typeof ref === "string" ? ref : null);
  return (
    <>
      <p className={styles.alt}>
        Plain Markdown for agents: <a href={`/${id}/llms.txt`}>/{id}/llms.txt</a> (same as{" "}
        <a href={`/${id}/docs/agents.md`}>/{id}/docs/agents.md</a>)
      </p>
      <Markdown source={markdown} />
    </>
  );
}

/**
 * /<game>/docs/agents[?ref=<addon version>]: a game's agent docs for people; the same text is plain Markdown at
 * /<game>/docs/agents.md and /<game>/llms.txt.
 */
export default function AgentDocsPage(props: Props) {
  return (
    <main className={styles.docs}>
      <Suspense fallback={<p>Loading…</p>}>
        <Docs {...props} />
      </Suspense>
    </main>
  );
}
