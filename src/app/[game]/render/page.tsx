import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { findServerGame } from "@/games/server";
import type { ServerGame } from "@/server/game";
import { errorMessage } from "@/lib/errors";
import { PushError, renderScene } from "@/server/workspaces";
import { readRenderOptions, readRenderWorkspace, RenderOptionsError } from "@/workspace";
import { AuraRender, RenderProblem } from "../../render/AuraRender";

type Props = PageProps<"/[game]/render">;

export const metadata: Metadata = { title: "Render · Aura Simulator", robots: { index: false } };

function searchOf(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") search.set(key, value);
  return search;
}

async function Render({ params, searchParams }: Props) {
  await connection();
  const server = findServerGame((await params).game)!; // the layout answers 404 for other ids
  const search = searchOf(await searchParams);
  const loaded = await load(server, search).catch((e: unknown) =>
    e instanceof RenderOptionsError || e instanceof PushError ? e.message : `Could not load the aura core: ${errorMessage(e)}`,
  );
  if (typeof loaded === "string") return <RenderProblem message={loaded} />;
  return <AuraRender gameId={server.game.id} scene={loaded.scene} options={loaded.options} />;
}

async function load(server: ServerGame, search: URLSearchParams) {
  const options = readRenderOptions(search);
  return { options, scene: await renderScene(server, readRenderWorkspace(search), options) };
}

/**
 * /<game>/render?w=<workspace>&aura=<id>[&scale=&padding=&background=&situation=&ref=]: one aura of a workspace's
 * recent pushes drawn as the game draws it and nothing else, cropped to its bounds (`readRenderOptions`). The
 * screenshot endpoint (`/api/<game>/workspaces/<id>/screenshot.png`) takes its picture; agents can open it too.
 */
export default function RenderPage(props: Props) {
  return (
    <Suspense>
      <Render {...props} />
    </Suspense>
  );
}
