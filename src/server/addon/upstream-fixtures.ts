/**
 * Recorded upstream answers for an addon source cache, for tests (ADDON_UPSTREAM_FIXTURES=<dir>, read per game from
 * `<dir>/<game>/addon`).
 *
 * GitHub's unauthenticated API allows 60 requests an hour; when that runs out the version list falls
 * back to jsDelivr's names and tests that expect the real tag names fail. With fixtures, the version
 * list and release resolution never touch the network:
 *
 *   <dir>/jsdelivr-versions.json      data.jsdelivr.com version list
 *   <dir>/github-tags.json            GitHub /tags (all of them, one page)
 *   <dir>/github-trees/<sha>.json     GitHub /git/trees/<tag>?recursive=1 (tags are looked up to their commit)
 *
 * A GitHub request the fixtures can't answer gets a 404, as GitHub would answer it. Everything else
 * (file contents and flat listings from jsDelivr) goes to `passthrough`, so the source cache keeps them
 * on disk and repeat runs need no network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FetchFn } from "./upstream";

interface Ref {
  name: string;
  commit: { sha: string };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function createUpstreamFixtureFetch(dir: string, repo: string, passthrough: FetchFn): FetchFn {
  const read = (name: string): unknown => JSON.parse(readFileSync(path.join(dir, name), "utf8"));
  const tags = read("github-tags.json") as Ref[];
  const versions = read("jsdelivr-versions.json");
  const repoPath = `/repos/${repo}`;
  const jsDelivrList = `/v1/packages/gh/${repo}`;
  const notFound = () => json({ message: "Not Found" }, 404);

  return async (input, init) => {
    const u = new URL(String(input));
    if (u.host === "api.github.com") {
      if (!u.pathname.startsWith(repoPath)) return notFound();
      const rest = u.pathname.slice(repoPath.length);
      if (rest === "/tags") return json(u.searchParams.get("page") === "1" ? tags : []);
      const m = /^\/git\/trees\/(.+)$/.exec(rest);
      if (m) {
        const ref = decodeURIComponent(m[1]);
        const sha = tags.find((t) => t.name === ref)?.commit.sha ?? ref.toLowerCase();
        if (!/^[0-9a-f]{40}$/.test(sha)) return notFound();
        try {
          return json(read(path.join("github-trees", `${sha}.json`)));
        } catch {
          return notFound();
        }
      }
      return notFound();
    }
    if (u.host === "data.jsdelivr.com" && u.pathname === jsDelivrList) return json(versions);
    return passthrough(String(input), init);
  };
}
