/**
 * What changed between two addon versions, for the version picker.
 *
 * Until the aura core describes a full options schema, the diff compares:
 * - the option tables of every region and sub-region type (defaults and condition properties,
 *   extracted by running RegionTypes/*.lua and SubRegionTypes/*.lua; see option-tables.ts),
 * - the file lists (added, removed and changed files),
 * - the CHANGELOG sections the newer version adds.
 */
import { extractOptionTables, isRegionFile, type OptionTable, type OptionTables } from "./option-tables";
import type { FileListing } from "./remote";
import type { AddonSourceCache, Resolution } from "./source-cache";

export interface TypeChange {
  /** Region type ("icon") or sub-region type ("subglow"). */
  type: string;
  status: "added" | "removed" | "changed";
  addedOptions: string[];
  removedOptions: string[];
  changedDefaults: { option: string; from: unknown; to: unknown }[];
  addedProperties: string[];
  removedProperties: string[];
}

export interface AddonDiff {
  from: Resolution;
  to: Resolution;
  options: {
    regionTypes: TypeChange[];
    subRegionTypes: TypeChange[];
    /** Region/sub-region files whose option tables couldn't be read, per side. */
    unreadable: { from: string[]; to: string[] };
  };
  files: {
    added: string[];
    removed: string[];
    changed: string[];
    /** Where the lists came from, and whether they are complete (jsDelivr lists at most 1000 files). */
    source: FileListing["source"][];
    complete: boolean;
  };
  /** CHANGELOG.md sections present in `to` but not in `from` (Markdown), or null. */
  changelog: string | null;
  /** One line per notable change, for the UI. */
  summary: string[];
}

const CHANGELOG = "WeakAuras/CHANGELOG.md";

export function diffListings(a: FileListing, b: FileListing): AddonDiff["files"] {
  const from = new Map(a.files.map((f) => [f.path, f.hash]));
  const to = new Map(b.files.map((f) => [f.path, f.hash]));
  const comparable = a.source === b.source;
  return {
    added: [...to.keys()].filter((p) => !from.has(p)),
    removed: [...from.keys()].filter((p) => !to.has(p)),
    // Hashes are only comparable when both lists come from the same source.
    changed: comparable ? [...to.keys()].filter((p) => from.has(p) && from.get(p) !== to.get(p)) : [],
    source: [a.source, b.source],
    complete: a.complete && b.complete,
  };
}

const sameValue = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

function diffTable(type: string, a: OptionTable | undefined, b: OptionTable | undefined): TypeChange | null {
  const change: TypeChange = {
    type,
    status: !a ? "added" : !b ? "removed" : "changed",
    addedOptions: [],
    removedOptions: [],
    changedDefaults: [],
    addedProperties: [],
    removedProperties: [],
  };
  const da = a?.defaults ?? {};
  const db = b?.defaults ?? {};
  change.addedOptions = Object.keys(db).filter((k) => !(k in da)).sort();
  change.removedOptions = Object.keys(da).filter((k) => !(k in db)).sort();
  change.changedDefaults = Object.keys(db)
    .filter((k) => k in da && !sameValue(da[k], db[k]))
    .sort()
    .map((option) => ({ option, from: da[option], to: db[option] }));
  const pa = new Set(a?.properties ?? []);
  const pb = new Set(b?.properties ?? []);
  change.addedProperties = [...pb].filter((p) => !pa.has(p)).sort();
  change.removedProperties = [...pa].filter((p) => !pb.has(p)).sort();
  const empty =
    change.status === "changed" &&
    !change.addedOptions.length &&
    !change.removedOptions.length &&
    !change.changedDefaults.length &&
    !change.addedProperties.length &&
    !change.removedProperties.length;
  return empty ? null : change;
}

export function diffOptionTables(
  a: Record<string, OptionTable>,
  b: Record<string, OptionTable>,
): TypeChange[] {
  const types = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return types.map((t) => diffTable(t, a[t], b[t])).filter((c): c is TypeChange => c !== null);
}

/** Changelog sections (split at `#`/`##` headings that name a version) of `to` that `from` lacks. */
export function newChangelogSections(from: string | null, to: string | null): string | null {
  if (!to) return null;
  const split = (text: string) => text.replace(/\r\n?/g, "\n").split(/\n(?=#{1,2} [^\n]*\d+\.\d+)/);
  const toSections = split(to);
  const known = new Set((from ? split(from) : []).map((s) => s.split("\n", 1)[0].trim()));
  const fresh = toSections.filter((s) => /^#{1,2} [^\n]*\d+\.\d+/.test(s) && !known.has(s.split("\n", 1)[0].trim()));
  return fresh.length ? fresh.join("\n").trim() : null;
}

export function summarise(options: AddonDiff["options"], files: AddonDiff["files"]): string[] {
  const lines: string[] = [];
  for (const [label, changes] of [
    ["Region type", options.regionTypes],
    ["Sub-element", options.subRegionTypes],
  ] as const) {
    for (const c of changes) {
      if (c.status !== "changed") {
        lines.push(`${label} ${c.type} ${c.status}`);
        continue;
      }
      const parts: string[] = [];
      if (c.addedOptions.length) parts.push(`new options ${c.addedOptions.join(", ")}`);
      if (c.removedOptions.length) parts.push(`removed options ${c.removedOptions.join(", ")}`);
      if (c.changedDefaults.length) {
        parts.push(
          `new defaults ${c.changedDefaults.map((d) => `${d.option} ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`).join(", ")}`,
        );
      }
      if (c.addedProperties.length) parts.push(`conditions can now change ${c.addedProperties.join(", ")}`);
      if (c.removedProperties.length) parts.push(`conditions can no longer change ${c.removedProperties.join(", ")}`);
      lines.push(`${label} ${c.type}: ${parts.join("; ")}`);
    }
  }
  if (!options.regionTypes.length && !options.subRegionTypes.length) lines.push("No option changes in region or sub-element types");
  lines.push(`Files: ${files.added.length} added, ${files.removed.length} removed, ${files.changed.length} changed`);
  return lines;
}

async function optionTablesAt(cache: AddonSourceCache, resolution: Resolution, listing: FileListing): Promise<OptionTables> {
  return cache.memo(resolution, "option-tables", async () => {
    const regionFiles = listing.files.map((f) => f.path).filter(isRegionFile);
    const files = await Promise.all(
      regionFiles.map(async (p) => ({ path: p, text: await cache.readText(resolution.ref, p) })),
    );
    return extractOptionTables(files);
  });
}

async function readOptional(cache: AddonSourceCache, ref: string, file: string): Promise<string | null> {
  try {
    return await cache.readText(ref, file);
  } catch {
    return null;
  }
}

/** Diffs two refs (any release, branch or commit). */
export async function diffAddonVersions(cache: AddonSourceCache, fromInput: string, toInput: string): Promise<AddonDiff> {
  const [a, b] = await Promise.all([cache.listFiles(fromInput), cache.listFiles(toInput)]);
  const [ta, tb, ca, cb] = await Promise.all([
    optionTablesAt(cache, a.resolution, a.listing),
    optionTablesAt(cache, b.resolution, b.listing),
    readOptional(cache, a.resolution.ref, CHANGELOG),
    readOptional(cache, b.resolution.ref, CHANGELOG),
  ]);
  const options: AddonDiff["options"] = {
    regionTypes: diffOptionTables(ta.regionTypes, tb.regionTypes),
    subRegionTypes: diffOptionTables(ta.subRegionTypes, tb.subRegionTypes),
    unreadable: { from: ta.failures.map((f) => f.file), to: tb.failures.map((f) => f.file) },
  };
  const files = diffListings(a.listing, b.listing);
  return {
    from: a.resolution,
    to: b.resolution,
    options,
    files,
    changelog: newChangelogSections(ca, cb),
    summary: summarise(options, files),
  };
}
