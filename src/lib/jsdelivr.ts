/** A file of a GitHub repo ("owner/name") at `ref` on jsDelivr (`path` relative to the repo root, `/`-separated). */
export function jsDelivrUrl(repo: string, ref: string, path: string): string {
  return `https://cdn.jsdelivr.net/gh/${repo}@${encodeURIComponent(ref)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
