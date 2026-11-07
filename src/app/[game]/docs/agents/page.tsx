import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { findServerGame } from "@/games/server";
import type { ServerGame } from "@/server/game";
import { requestOrigin } from "@/server/request-origin";
import { Markdown } from "./Markdown";
import styles from "./docs.module.css";

type Props = PageProps<"/[game]/docs/agents">;

/** The page names its plain Markdown twin in the head too, for tools that read links rather than text. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game } = await params;
  return { title: "Agent docs · Aura Simulator", alternates: { types: { "text/markdown": `/${game}/llms.txt` } } };
}

async function Docs({ params, searchParams }: Props) {
  const server: ServerGame = findServerGame((await params).game)!; // the layout answers 404 for other ids
  const { ref } = await searchParams;
  const markdown = await server.agentDocs(requestOrigin(await headers()), typeof ref === "string" ? ref : null);
  return <Markdown source={markdown} />;
}

/**
 * /<game>/docs/agents[?ref=<addon version>]: a game's agent docs for people; the same text is plain Markdown at
 * /<game>/docs/agents.md and /<game>/llms.txt. The docs depend on the request (its origin, the addon version), so
 * they stream in after the page's shell; the shell itself already points agents (curl, fetch tools without
 * JavaScript) to the Markdown.
 */
export default async function AgentDocsPage(props: Props) {
  const id = (await props.params).game;
  const llms = `/${id}/llms.txt`;
  return (
    <main className={styles.docs}>
      <p className={styles.alt}>
        Agents: read the plain Markdown, no JavaScript needed: <a href={llms}>{llms}</a> (same as{" "}
        <a href={`/${id}/docs/agents.md`}>/{id}/docs/agents.md</a>).
      </p>
      <Suspense
        fallback={
          <p>
            Loading… The same docs as Markdown: <a href={llms}>{llms}</a>
          </p>
        }
      >
        <Docs {...props} />
      </Suspense>
    </main>
  );
}
