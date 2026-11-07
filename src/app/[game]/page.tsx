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

/**
 * Fully prerendered for every game: a request for an id that isn't one then waits for its render instead of getting the
 * prerendered fallback shell first, so the layout's notFound() answers 404 (with the shell, a fresh production server
 * answered 200 until the id had been rendered once). Request-time pages under [game] are checked in `src/proxy.ts`.
 */
export const ensureStatic = "navigation";

/** /<game>: a game's site, the window beside the game screen. */
export default function GamePage(props: PageProps<"/[game]">) {
  return (
    <Suspense>
      <Site {...props} />
    </Suspense>
  );
}
