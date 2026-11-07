import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { findServerGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { resolveServerRef } from "@/server/addon/core";
import { readFontSampleOptions, RenderOptionsError } from "@/workspace";
import { FontSample } from "../../../fonts/FontSample";
import { RenderProblem } from "../../../render/AuraRender";

type Props = PageProps<"/[game]/fonts/sample">;

export const metadata: Metadata = { title: "Font sample · Aura Simulator", robots: { index: false } };

function searchOf(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") search.set(key, value);
  return search;
}

async function Sample({ params, searchParams }: Props) {
  await connection();
  const server = findServerGame((await params).game)!; // the layout answers 404 for other ids
  let options;
  try {
    options = readFontSampleOptions(searchOf(await searchParams));
  } catch (e) {
    return <RenderProblem message={e instanceof RenderOptionsError ? e.message : errorMessage(e)} />;
  }
  const { ref } = await resolveServerRef(server, options.ref);
  return <FontSample gameId={server.game.id} addonRef={ref} options={options} />;
}

/**
 * /<game>/fonts/sample?font=<name>[&text=&size=&outline=&shadowX=&shadowY=&colour=&scale=&background=&ref=]: one font
 * drawing a text as the game screen draws a text, and nothing else (`readFontSampleOptions`). The picture endpoint
 * (`/api/<game>/fonts/sample.png`) takes its picture; agents can open it too.
 */
export default function FontSamplePage(props: Props) {
  return (
    <Suspense>
      <Sample {...props} />
    </Suspense>
  );
}
