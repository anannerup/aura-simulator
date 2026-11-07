import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { findServerGame } from "@/games/server";
import { loadGameMedia } from "@/server/media";
import { requestOrigin } from "@/server/request-origin";
import { FontSamples } from "../../fonts/FontSamples";
import styles from "../../fonts/FontSamples.module.css";

type Props = PageProps<"/[game]/fonts">;

export const metadata: Metadata = { title: "Fonts · Aura Simulator" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Samples({ params, searchParams }: Props) {
  const server = findServerGame((await params).game)!; // the layout answers 404 for other ids
  const query = await searchParams;
  const media = await loadGameMedia(server, requestOrigin(await headers()), one(query.ref) ?? null);
  const size = Math.max(6, Math.min(72, Number(one(query.size)) || 22));
  const font = media.types.font;
  return (
    <>
      <p>
        {server.game.addon.name} {media.ref}: the {font.entries.length} fonts of a stock {server.game.name} client with the
        addon ({`size ${size}, ${one(query.outline) ?? "OUTLINE"}`}). A font name outside this list is drawn in the
        default font ({font.default}) in game.
      </p>
      <FontSamples
        gameId={server.game.id}
        addonRef={media.ref}
        fonts={font.entries}
        defaultFont={font.default}
        text={one(query.text) ?? "Food 12 0:42 Flask"}
        size={size}
        outline={one(query.outline) ?? "OUTLINE"}
      />
    </>
  );
}

/**
 * /<game>/fonts[?text=<sample>&size=<6-72>&outline=<OUTLINE|THICKOUTLINE|None>&ref=<addon version>]: every font of the
 * game's LibSharedMedia list drawing the sample text in the game's own font files, for identifying the font in a
 * screenshot (open it in a browser or a screenshot tool). The list as JSON: /api/<game>/media.
 */
export default function FontsPage(props: Props) {
  return (
    <main className={styles.page}>
      <h1>Fonts</h1>
      <Suspense fallback={<p>Loading the addon&apos;s font list…</p>}>
        <Samples {...props} />
      </Suspense>
    </main>
  );
}
