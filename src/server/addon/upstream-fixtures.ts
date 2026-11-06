/**
 * Recorded upstream answers for the addon source cache, for tests (ADDON_UPSTREAM_FIXTURES=<dir>).
 *
 * GitHub's unauthenticated API allows 60 requests an hour; when that runs out the version list falls
 * back to jsDelivr's names and tests that expect the real tag names fail. With fixtures, the version
 * list and ref resolution never touch the network:
 *
 *   <dir>/jsdelivr-versions.json      data.jsdelivr.com version list
 *   <dir>/github-tags.json            GitHub /tags (all of them, one page)
 *   <dir>/github-branches.json        GitHub /branches (also answers /branches/<name> and /commits/<sha>)
 *   <dir>/github-trees/<sha>.json     GitHub /git/trees/<sha>?recursive=1 (tags are looked up to their commit)
 *
 * A GitHub request the fixtures can't answer gets a 404, as GitHub would answer it. Everything else
 * (file contents and flat listings from jsDelivr) goes to `passthrough`, so the source cache keeps them
 * on disk and repeat runs need no network.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ADDON_REPO } from "@/core";
import type { FetchFn } from "./remote";

interface Ref {
  name: string;
  commit: { sha: string };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function createUpstreamFixtureFetch(dir: string, passthrough: FetchFn): FetchFn {
  const read = (name: string): unknown => JSON.parse(readFileSync(path.join(dir, name), "utf8"));
  const tags = read("github-tags.json") as Ref[];
  const branches = read("github-branches.json") as Ref[];
  const versions = read("jsdelivr-versions.json");
  const repoPath = `/repos/${ADDON_REPO}`;
  const jsDelivrList = `/v1/packages/gh/${ADDON_REPO}`;
  const notFound = () => json({ message: "Not Found" }, 404);

  return async (input, init) => {
    const u = new URL(String(input));
    if (u.host === "api.github.com") {
      if (!u.pathname.startsWith(repoPath)) return notFound();
      const rest = u.pathname.slice(repoPath.length);
      if (rest === "/tags") return json(u.searchParams.get("page") === "1" ? tags : []);
      if (rest === "/branches") return json(branches);
      let m = /^\/branches\/(.+)$/.exec(rest);
      if (m) {
        const name = decodeURIComponent(m[1]);
        const b = branches.find((x) => x.name === name);
        return b ? json(b) : json({ message: "Branch not found" }, 404);
      }
      m = /^\/commits\/([0-9a-fA-F]+)$/.exec(rest);
      if (m) {
        const prefix = m[1].toLowerCase();
        const sha = [...tags, ...branches].map((t) => t.commit.sha).find((s) => s.startsWith(prefix));
        return sha ? json({ sha }) : json({ message: "No commit found for SHA" }, 422);
      }
      m = /^\/git\/trees\/(.+)$/.exec(rest);
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
