/**
 * Remote sources for an addon's tagged source on GitHub: jsDelivr (version list, file listings, file contents; no
 * rate limit) and GitHub's REST API (real tag names, full file trees; 60 requests/hour unauthenticated, so every
 * answer is cached by the caller). GITHUB_TOKEN raises the limit if set.
 */
import type { FileListing } from "@/api/addon";
import { HttpError } from "@/lib/fetch-json";
import { jsDelivrUrl } from "@/lib/jsdelivr";
import { AddonRefError, type GitHubTag } from "./refs";

export type { FileListing };

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** An addon's GitHub repository ("owner/name") and the name players know it by. */
export interface AddonRepo {
  repo: string;
  name: string;
}

function githubInit(): RequestInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "aura-simulator",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return { headers };
}

async function getJson<T>(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<T> {
  const res = await fetchFn(url, init);
  if (!res.ok) throw new HttpError(res.status, `GET ${url} failed: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface Upstream {
  /** jsDelivr's normalized version list. */
  jsDelivrVersions(): Promise<string[]>;
  /** Every tag of the repo with its commit. */
  gitHubTags(): Promise<GitHubTag[]>;
  /** All files at a tag: GitHub's recursive tree, or jsDelivr's flat listing when GitHub is unavailable. */
  fileListing(ref: string): Promise<FileListing>;
  /** One file's bytes from jsDelivr. */
  file(ref: string, path: string): Promise<Uint8Array>;
}

export function createUpstream({ repo, name }: AddonRepo, fetchFn: FetchFn): Upstream {
  const jsDelivrData = `https://data.jsdelivr.com/v1/packages/gh/${repo}`;
  const githubApi = `https://api.github.com/repos/${repo}`;
  return {
    async jsDelivrVersions() {
      const body = await getJson<{ versions?: { version: string }[] }>(fetchFn, jsDelivrData);
      return (body.versions ?? []).map((v) => v.version);
    },

    async gitHubTags() {
      const tags: GitHubTag[] = [];
      for (let page = 1; page <= 10; page++) {
        const body = await getJson<{ name: string; commit: { sha: string } }[]>(
          fetchFn,
          `${githubApi}/tags?per_page=100&page=${page}`,
          githubInit(),
        );
        tags.push(...body.map((t) => ({ name: t.name, sha: t.commit.sha })));
        if (body.length < 100) break;
      }
      return tags;
    },

    async fileListing(ref) {
      try {
        const body = await getJson<{ tree: { path: string; type: string; sha: string }[]; truncated: boolean }>(
          fetchFn,
          `${githubApi}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
          githubInit(),
        );
        const files = body.tree.filter((e) => e.type === "blob").map((e) => ({ path: e.path, hash: e.sha }));
        return { files: sortByPath(files), source: "github-tree", complete: !body.truncated };
      } catch {
        const body = await getJson<{ files: { name: string; hash: string }[] }>(
          fetchFn,
          `${jsDelivrData}@${encodeURIComponent(ref)}?structure=flat`,
        );
        const files = body.files.map((f) => ({ path: f.name.replace(/^\//, ""), hash: f.hash }));
        return { files: sortByPath(files), source: "jsdelivr-flat", complete: files.length < 1000 };
      }
    },

    async file(ref, path) {
      const res = await fetchFn(jsDelivrUrl(repo, ref, path));
      if (res.status === 404) throw new AddonRefError(`${name} ${ref} has no file ${path}`, 404);
      if (!res.ok) throw new AddonRefError(`Could not load ${path} of ${name} ${ref}: HTTP ${res.status}`, 502);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

const sortByPath = <T extends { path: string }>(files: T[]) =>
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
