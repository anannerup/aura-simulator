import type { AddonSourceFetcher } from "../addon-source";

/** The addons the full VM loads, in load order. */
export const FULL_VM_ADDONS = ["WeakAuras", "WeakAurasOptions"] as const;

export interface Toc {
  /** `## Key: Value` lines. */
  meta: Record<string, string>;
  /** File entries in order (.lua and .xml), with forward slashes. */
  files: string[];
}

export function parseToc(text: string): Toc {
  const meta: Record<string, string> = {};
  const files: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^##\s*([^:]+):\s*(.*)$/.exec(line);
    if (m) {
      meta[m[1].trim()] = m[2].trim();
      continue;
    }
    if (line.startsWith("#")) continue;
    files.push(line.replace(/\\/g, "/"));
  }
  return { meta, files };
}

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Locale files other than enUS return immediately in an English client; they are skipped (1.8 MB). */
export function isForeignLocale(relPath: string): boolean {
  const m = /(?:^|\/)Locales\/([a-z]{2}[A-Z]{2})\.lua$/.exec(relPath);
  return m !== null && m[1] !== "enUS";
}

/**
 * An addon's Lua files in load order: the .toc's entries with XML `<Script file>` / `<Include file>`
 * expanded (inline frame XML is ignored: there is no FrameXML runtime). Paths are relative to the
 * addon folder.
 */
export async function addonLoadOrder(fetchSource: AddonSourceFetcher, addon: string): Promise<{ toc: Toc; files: string[] }> {
  const toc = parseToc(await fetchSource(`${addon}/${addon}.toc`));
  const expand = async (relPath: string): Promise<string[]> => {
    const lower = relPath.toLowerCase();
    if (lower.endsWith(".lua")) return [relPath];
    if (!lower.endsWith(".xml")) return [];
    const xml = await fetchSource(`${addon}/${relPath}`);
    const dir = dirname(relPath);
    const targets = [...xml.matchAll(/<(?:Script|Include)\s+file\s*=\s*"([^"]+)"/g)].map((m) =>
      normalize(`${dir}/${m[1].replace(/\\/g, "/")}`),
    );
    return (await Promise.all(targets.map(expand))).flat();
  };
  const files = (await Promise.all(toc.files.map(expand))).flat().filter((f) => !isForeignLocale(f));
  return { toc, files };
}
