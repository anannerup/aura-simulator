import { NextResponse, type NextRequest } from "next/server";
import { findGame } from "@/games";

/**
 * A game's request-time pages (rendered per request: they read the request's origin, its search params or the release
 * list) answer 404 for an id that isn't a game. Their `[game]` layout calls notFound() too, but on a production server
 * a page that renders per request first sends its prerendered shell (Partial Prefetching), so the layout's notFound()
 * came too late and the page answered 200. The static game page (`/<game>`) needs no check here: it is fully
 * prerendered (`ensureStatic`), so an unknown id waits for its render and gets the layout's 404. Route handlers answer
 * 404 themselves (`routeGame`). `proxy.test.ts` checks that every request-time page under `[game]` is matched.
 */
export function proxy(request: NextRequest) {
  const game = request.nextUrl.pathname.split("/")[1];
  if (!findGame(decodeURIComponent(game))) return new NextResponse("Not found", { status: 404 });
  return NextResponse.next();
}

export const config = { matcher: ["/:game/docs/agents", "/:game/fonts", "/:game/fonts/sample", "/:game/render"] };
