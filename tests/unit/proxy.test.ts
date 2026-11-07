/** The proxy answers 404 for request-time pages of ids that aren't games, and matches every such page. */
import { readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { expect, test } from "vitest";
import { config, proxy } from "@/proxy";

const GAME_DIR = path.resolve(__dirname, "../../src/app/[game]");

test("every page under [game] but the (fully prerendered) game page is matched", () => {
  const pages = readdirSync(GAME_DIR, { recursive: true, encoding: "utf8" })
    .filter((f) => path.basename(f) === "page.tsx" && path.dirname(f) !== ".")
    .map((f) => `/:game/${path.dirname(f).split(path.sep).join("/")}`)
    .sort();
  expect(pages.length).toBeGreaterThan(0);
  expect([...config.matcher].sort()).toEqual(pages);
});

test("an id that isn't a game is not found; a game passes on", () => {
  expect(proxy(new NextRequest("http://localhost/classic/fonts")).status).toBe(404);
  expect(proxy(new NextRequest("http://localhost/llms.txt/docs/agents")).status).toBe(404);
  expect(proxy(new NextRequest("http://localhost/tbc/render?w=x")).headers.get("x-middleware-next")).toBe("1");
});
