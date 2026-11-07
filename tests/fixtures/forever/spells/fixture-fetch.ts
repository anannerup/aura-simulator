import { readFileSync } from "node:fs";
import path from "node:path";

/** One game's recorded spell fixtures: the folder, the build its CSVs are from, and its Wowhead path. */
export interface SpellFixtures {
  dir: string;
  build: string;
  wowheadPath: string;
}

/** WoW Forever: real rows from wago.tools build 1.60.1.70790 (product wowf), Wowhead `/classic/`. */
export const FOREVER_FIXTURES: SpellFixtures = { dir: __dirname, build: "1.60.1.70790", wowheadPath: "classic" };

/**
 * A fetch replacement serving recorded wago.tools / Wowhead responses from a fixture folder
 * (Forever's, this folder, by default). The CSVs (SpellName, SpellMisc, ManifestInterfaceData, ItemSparse, Item) are
 * real wago.tools rows, trimmed (ItemSparse and Item to the columns the item cache reads; recorded 2026-11-07);
 * wowhead/<id>.json are real Wowhead tooltip responses (an `error` body is served as 404).
 * Unknown URLs fail like a network error. `calls` records every requested URL.
 */
export function createFixtureFetch(overrides: Record<string, () => Response> = {}, fixtures: SpellFixtures = FOREVER_FIXTURES) {
  const calls: string[] = [];
  const read = (file: string) => readFileSync(path.join(fixtures.dir, file), "utf8");
  const wowheadPattern = new RegExp(`^/${fixtures.wowheadPath}/tooltip/spell/(\\d+)$`);

  async function fixtureFetch(input: string): Promise<Response> {
    calls.push(input);
    const url = new URL(input);
    for (const [prefix, make] of Object.entries(overrides)) if (input.startsWith(prefix)) return make();

    if (url.host === "wago.tools" && url.pathname === "/api/builds/latest") {
      return new Response(read("builds-latest.json"), { headers: { "content-type": "application/json" } });
    }
    const db2 = url.host === "wago.tools" && url.pathname.match(/^\/db2\/(\w+)\/csv$/);
    if (db2 && url.searchParams.get("build") === fixtures.build) {
      return new Response(read(`${db2[1]}.csv`), { headers: { "content-type": "text/csv" } });
    }
    const wh = url.host === "nether.wowhead.com" && url.pathname.match(wowheadPattern);
    if (wh) {
      let body: string;
      try {
        body = read(`wowhead/${wh[1]}.json`);
      } catch {
        throw new TypeError(`fetch failed: no recorded Wowhead fixture for spell ${wh[1]}`);
      }
      const status = (JSON.parse(body) as { error?: string }).error ? 404 : 200;
      return new Response(body, { status, headers: { "content-type": "application/json" } });
    }
    throw new TypeError(`fetch failed: no fixture for ${input}`);
  }

  return { fetch: fixtureFetch, calls };
}
