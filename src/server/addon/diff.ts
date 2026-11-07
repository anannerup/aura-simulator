/**
 * What changed between two addon versions, for the version picker:
 * - the option tables of every region and sub-region type (defaults and the properties conditions can
 *   change), from each version's own registries (AuraCore.registries),
 * - the file lists (added, removed and changed files),
 * - the CHANGELOG sections the newer version adds.
 */
import type { Registries } from "@/core";
import type { AddonDiff, FileListing, OptionTable, OptionTables, TypeChange } from "@/api/addon";
import type { AddonSourceCache, Resolution } from "./source-cache";
import { errorMessage } from "@/lib/errors";

export type { AddonDiff, OptionTable, OptionTables, TypeChange };

/** Reads an addon version's registries (the server's aura core for that resolved ref). */
export type RegistriesOf = (resolution: Resolution) => Promise<Registries>;

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

export function summarize(options: AddonDiff["options"], files: AddonDiff["files"]): string[] {
  const lines: string[] = [];
  for (const side of ["from", "to"] as const) {
    if (options.unreadable[side]) lines.push(`Options of the ${side === "from" ? "old" : "new"} version couldn't be read: ${options.unreadable[side]}`);
  }
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
  const compared = !options.unreadable.from && !options.unreadable.to;
  if (compared && !options.regionTypes.length && !options.subRegionTypes.length) lines.push("No option changes in region or sub-element types");
  lines.push(`Files: ${files.added.length} added, ${files.removed.length} removed, ${files.changed.length} changed`);
  return lines;
}

type Entry = Record<string, unknown> | undefined;
const record = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : Array.isArray(v) && v.length === 0 ? {} : null;
const propertyNames = (v: unknown): string[] | null => {
  const r = record(v);
  return r && !("__error" in r) ? Object.keys(r).sort() : null;
};

/**
 * The option tables in a version's registries. A sub-region type's defaults and properties can depend on its
 * parent; they are read for an icon parent where the type supports icons, else for its first supported parent.
 */
export function optionTablesOf(registries: Registries): OptionTables {
  const regionTypes: Record<string, OptionTable> = {};
  for (const [name, rt] of Object.entries(record(registries.regionTypes) ?? {}) as [string, Entry][]) {
    regionTypes[name] = { defaults: record(rt?.default), properties: propertyNames(rt?.properties) };
  }
  const subRegionTypes: Record<string, OptionTable> = {};
  for (const [name, st] of Object.entries(record(registries.subRegionTypes) ?? {}) as [string, Entry][]) {
    const supports = Array.isArray(st?.supports) ? (st.supports as string[]) : [];
    const parent = supports.includes("icon") ? "icon" : supports[0];
    subRegionTypes[name] = {
      defaults: parent ? record(record(st?.defaults)?.[parent]) : null,
      properties: parent ? propertyNames(record(st?.properties)?.[parent]) : null,
    };
  }
  return { regionTypes, subRegionTypes };
}

async function optionTablesAt(cache: AddonSourceCache, resolution: Resolution, registriesOf: RegistriesOf) {
  try {
    return { tables: await cache.memo(resolution, "registry-option-tables", async () => optionTablesOf(await registriesOf(resolution))) };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

async function readOptional(cache: AddonSourceCache, ref: string, file: string): Promise<string | null> {
  try {
    return await cache.readText(ref, file);
  } catch {
    return null;
  }
}

/** Diffs two refs (any release, branch or commit). */
export async function diffAddonVersions(
  cache: AddonSourceCache,
  registriesOf: RegistriesOf,
  fromInput: string,
  toInput: string,
): Promise<AddonDiff> {
  const [a, b] = await Promise.all([cache.listFiles(fromInput), cache.listFiles(toInput)]);
  const [ta, tb, ca, cb] = await Promise.all([
    optionTablesAt(cache, a.resolution, registriesOf),
    optionTablesAt(cache, b.resolution, registriesOf),
    readOptional(cache, a.resolution.ref, CHANGELOG),
    readOptional(cache, b.resolution.ref, CHANGELOG),
  ]);
  const both = ta.tables && tb.tables;
  const options: AddonDiff["options"] = {
    regionTypes: both ? diffOptionTables(ta.tables.regionTypes, tb.tables.regionTypes) : [],
    subRegionTypes: both ? diffOptionTables(ta.tables.subRegionTypes, tb.tables.subRegionTypes) : [],
    unreadable: { from: ta.error ?? null, to: tb.error ?? null },
  };
  const files = diffListings(a.listing, b.listing);
  return {
    from: a.resolution,
    to: b.resolution,
    options,
    files,
    changelog: newChangelogSections(ca, cb),
    summary: summarize(options, files),
  };
}
