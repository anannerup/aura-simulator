import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A fetch replacement serving recorded wago.tools / Wowhead responses from this folder.
 * The CSVs are real rows from wago.tools build 1.60.1.70790 (product wowf), trimmed;
 * wowhead/<id>.json are real Wowhead tooltip responses (an `error` body is served as 404).
 * Unknown URLs fail like a network error. `calls` records every requested URL.
 */
export function createFixtureFetch(overrides: Record<string, () => Response> = {}) {
  const dir = __dirname;
  const calls: string[] = [];
  const read = (file: string) => readFileSync(path.join(dir, file), "utf8");

  async function fixtureFetch(input: string): Promise<Response> {
    calls.push(input);
    const url = new URL(input);
    for (const [prefix, make] of Object.entries(overrides)) if (input.startsWith(prefix)) return make();

    if (url.host === "wago.tools" && url.pathname === "/api/builds/latest") {
      return new Response(read("builds-latest.json"), { headers: { "content-type": "application/json" } });
    }
    const db2 = url.host === "wago.tools" && url.pathname.match(/^\/db2\/(\w+)\/csv$/);
    if (db2 && url.searchParams.get("build") === "1.60.1.70790") {
      return new Response(read(`${db2[1]}.csv`), { headers: { "content-type": "text/csv" } });
    }
    const wh = url.host === "nether.wowhead.com" && url.pathname.match(/^\/classic\/tooltip\/spell\/(\d+)$/);
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
