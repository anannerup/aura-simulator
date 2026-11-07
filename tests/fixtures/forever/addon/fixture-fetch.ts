import { readFileSync } from "node:fs";
import path from "node:path";
import type { FetchFn } from "@/server/addon";

/**
 * Fake jsDelivr and GitHub for Musca Auras' source cache. Version and tag lists are recorded responses
 * (2026-11-06); file contents, trees and listings are synthetic and name the ref they came from.
 */
const load = (name: string) => JSON.parse(readFileSync(path.join(__dirname, name), "utf8"));
const jsDelivrVersions = load("jsdelivr-versions.json");
const tags: { name: string; commit: { sha: string } }[] = load("github-tags.json");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Files every synthetic ref has. */
export const FIXTURE_FILES = ["WeakAuras/Init.lua", "WeakAuras/CHANGELOG.md", "README.md"];

export function createFixtureFetch(options: { githubDown?: boolean; jsDelivrDown?: boolean } = {}) {
  const calls: string[] = [];
  const fetch: FetchFn = async (input) => {
    const url = String(input);
    calls.push(url);
    const u = new URL(url);
    if (u.host === "api.github.com") {
      if (options.githubDown) return json({ message: "API rate limit exceeded" }, 403);
      const rest = u.pathname.replace("/repos/dldvlpr-addons-wow/Musca-Auras", "");
      if (rest === "/tags") return json(u.searchParams.get("page") === "1" ? tags : []);
      const m = /^\/git\/trees\/(.+)$/.exec(rest);
      if (m) {
        const ref = decodeURIComponent(m[1]);
        return json({
          tree: [
            { path: "WeakAuras", type: "tree", sha: "dir" },
            ...FIXTURE_FILES.map((p) => ({ path: p, type: "blob", sha: `${p === "README.md" ? "same" : ref}-${p}` })),
          ],
          truncated: false,
        });
      }
      return json({ message: "Not Found" }, 404);
    }
    if (options.jsDelivrDown) return new Response("down", { status: 503 });
    if (u.host === "data.jsdelivr.com") {
      const m = /^\/v1\/packages\/gh\/dldvlpr-addons-wow\/Musca-Auras(?:@(.+))?$/.exec(u.pathname);
      if (!m) return json({ status: 404 }, 404);
      if (!m[1]) return json(jsDelivrVersions);
      const ref = decodeURIComponent(m[1]);
      return json({ files: FIXTURE_FILES.map((p) => ({ name: `/${p}`, hash: `${ref}-${p}` })) });
    }
    if (u.host === "cdn.jsdelivr.net") {
      const m = /^\/gh\/dldvlpr-addons-wow\/Musca-Auras@([^/]+)\/(.+)$/.exec(u.pathname);
      if (!m) return new Response("not found", { status: 404 });
      const ref = decodeURIComponent(m[1]);
      if (!FIXTURE_FILES.includes(m[2])) return new Response("Couldn't find the requested file", { status: 404 });
      return new Response(`-- ${m[2]} at ${ref}\n`);
    }
    return new Response("unexpected host", { status: 500 });
  };
  return { fetch, calls };
}
