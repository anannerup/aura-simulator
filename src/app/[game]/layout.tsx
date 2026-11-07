import { notFound } from "next/navigation";
import { findGame, GAMES } from "@/games";

export function generateStaticParams() {
  return GAMES.map((game) => ({ game: game.id }));
}

/**
 * `/<game>/...` exists only for the games the picker offers; any other first segment (the old unscoped `/llms.txt`,
 * `/docs/agents`, a game still to come) is a 404. Checking that needs the URL before anything renders, so navigations
 * into a game are not validated as instant (`instant = false`): each game is its own site, entered from the picker.
 */
export const instant = false;

export default async function GameLayout({ children, params }: LayoutProps<"/[game]">) {
  if (!findGame((await params).game)) notFound();
  return children;
}
