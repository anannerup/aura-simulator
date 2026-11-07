import { Suspense } from "react";
import type { Metadata } from "next";
import { findGame } from "@/games";
import { AuraSimulator } from "../AuraSimulator";

export async function generateMetadata({ params }: PageProps<"/[game]">): Promise<Metadata> {
  const game = findGame((await params).game);
  return game ? { title: `${game.name} · Aura Simulator` } : {};
}

async function Site({ params }: PageProps<"/[game]">) {
  return <AuraSimulator gameId={(await params).game} />; // the layout answers 404 for other ids
}

/** /<game>: a game's site, the window beside the game screen. */
export default function GamePage(props: PageProps<"/[game]">) {
  return (
    <Suspense>
      <Site {...props} />
    </Suspense>
  );
}
