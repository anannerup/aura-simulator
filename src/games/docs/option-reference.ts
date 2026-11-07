/**
 * The option ↔ table reference (core.optionReference()) as Markdown, for every game's agent docs: the docs section
 * (what it is, how its paths read as wago JSON keys, a few generated examples, where the whole reference is) and the
 * whole reference in both directions (served at /<game>/docs/agents/options.md). Pure; the server loads the
 * reference (`src/server/option-reference.ts`).
 */
import { pathPattern, plainText, type OptionReference, type OptionReferenceEntry } from "@/core";

const code = (s: string) => `\`${s}\``;
const json = (v: unknown) => JSON.stringify(v);

/** Where a game's reference is served, next to its agent docs. */
export function optionReferenceUrls(origin: string, game: string, ref: string) {
  const q = `?ref=${encodeURIComponent(ref)}`;
  return { md: `${origin}/${game}/docs/agents/options.md${q}`, json: `${origin}/${game}/docs/agents/options.json${q}` };
}

/**
 * A table path written out as the wago JSON that holds `value` there, from the aura's table:
 * `subRegions.2.text_text` → `{"subRegions": [{…}, {"text_text": "%p"}]}`, `triggers.1.trigger.type` →
 * `{"triggers": {"1": {"trigger": {"type": "aura2"}}}}`. `lists` (the reference's) says which tables are arrays.
 */
export function wagoJsonAt(path: string, value: unknown, lists: readonly string[]): string {
  const segs = path.split(".");
  const isArray = new Set(lists);
  const nest = (i: number): string => {
    if (i === segs.length) return json(value);
    const key = segs[i];
    const container = segs.slice(0, i).join(".");
    if (i > 0 && /^\d+$/.test(key) && isArray.has(pathPattern(container))) {
      return `[${"{…}, ".repeat(Number(key) - 1)}${nest(i + 1)}]`;
    }
    return `{${json(key)}: ${nest(i + 1)}}`;
  };
  return nest(0);
}

/** How the reference writes table paths (in the docs section and on the whole reference's page). */
const PATH_RULES = `Paths are wago JSON keys, read from the aura's table (wago JSON's \`d\`):
- Keys are joined with \`.\`: \`triggers.1.trigger.type\`, \`subRegions.2.text_text\`, \`color\`. Keys never contain
  \`.\`. **children:** marks a group's options that write each child's table (each \`c[i]\`) instead of the group's.
- A number n counts from 1. A table whose keys are all numbers is a JSON array, and n is its n-th element:
  \`subRegions\`, \`conditions\`, \`conditions.#.changes\`, a colour (the JSON's \`lists\` names them all), so
  \`subRegions.2.text_text\` is \`{"subRegions": [{…}, {"text_text": …}]}\`. A table that also has string keys is an
  object, and n is its key \`"n"\`: \`triggers.1.trigger.type\` is \`{"triggers": {"1": {"trigger": {"type": …}}},
  "activeTriggerMode": …}\` (\`triggers\` with only triggers in it is an array too). An empty table is \`[]\`.
  Write lists as arrays: a key \`"1"\` stays the string "1" except where wago restores number keys (\`triggers\`, a
  few \`multi\` tables; see wago JSON).
- The generator edits the first trigger, condition, property or sub element; every other number has the same
  options. The reverse index writes each number as \`#\` (\`triggers.#.trigger.type\`).
- \`*\` (multiselects) stands for one of the option's values: each checked value is \`<path with it>: true\`.
- A path ending at a table (\`triggers.2\`, \`subRegions.1\`) means the option writes that whole entry (Add,
  Duplicate, Delete); a path ending at a list (\`subRegions\`) means it rewrites the list.`;

const optionName = (e: OptionReferenceEntry) => plainText(e.name ?? "").trim() || e.option[e.option.length - 1];

/**
 * The agent docs' section on the reference. `reference` is null while it is being generated (the section then only
 * points to it).
 */
export function optionReferenceSection(origin: string, game: string, ref: string, reference: OptionReference | null): string {
  const urls = optionReferenceUrls(origin, game, ref);
  return `## Option ↔ table reference

Which wago JSON keys each option of the window writes, and which options write each key, generated from this addon
version: every option was changed once through its own set() on a new aura from the addon's New Aura, and the table
compared before and after. To write an aura's JSON from intent, find the option the player would use and write the
keys it writes, with a value of its type.

- **The whole reference, both directions, as Markdown:** \`GET ${urls.md}\` (key → options; then per tab every option
  with the keys it writes, its values or range and what a new aura has; the Trigger tab per trigger type and event).
- **As JSON:** \`GET ${urls.json}\` (\`entries\`: every option per display type, trigger type, event, added part and
  choice, with its \`writes\`, \`values\`, range, \`default\`, \`desc\` and, for selects whose choice writes a whole
  setting, what each choice writes; \`byPath\`: path pattern → entry indices; \`lists\`: the tables that are JSON arrays).

The first request for a version waits while the reference is generated (a minute or two, once per version).

${PATH_RULES}
${reference ? referenceExamples(reference) : ""}`;
}

/** A few generated lines of both directions (options every display has), each with its wago JSON. */
function referenceExamples(r: OptionReference): string {
  const label = new Map(r.tabs.map((t) => [t.key, t.label]));
  const onIcon = (pattern: string) =>
    (r.byPath[pattern] ?? [])
      .map((i) => r.entries[i])
      .find((e) => e.type !== "execute" && e.scopes.some((s) => s.regionType === "icon" && !s.triggerType && !s.added && !s.after));
  const options = ["desaturate", "width", "triggers.#.trigger.unit", "load.use_class"]
    .map(onIcon)
    .filter((e): e is OptionReferenceEntry => e !== undefined);
  const keys = ["alpha", "subRegions.#.text_text", "conditions.#.check.variable", "load.class.multi.*"].filter((p) => r.byPath[p]);
  if (options.length === 0 && keys.length === 0) return "";
  const asWago = (e: OptionReferenceEntry) => {
    const [path, value] = Object.entries(e.probe?.wrote ?? {})[0] ?? [];
    return path === undefined ? "" : `\n  wago JSON: ${code(wagoJsonAt(path, value, r.lists))}`;
  };
  return `
Examples (generated):

${options.map((e) => optionLine(e, r.regionTypes.length) + asWago(e)).join("\n")}
${keys.map((p) => reverseLine(r, p, label)).join("\n")}
`;
}

/** `Display › Desaturate; …` for a path pattern of the reverse index. */
function reverseLine(r: OptionReference, pattern: string, label: Map<string, string>): string {
  const names = [...new Set(r.byPath[pattern].map((i) => `${label.get(r.entries[i].tab) ?? r.entries[i].tab} › ${optionName(r.entries[i])}`))];
  return `- \`${pattern}\` ← ${names.slice(0, 8).join("; ")}${names.length > 8 ? `; … (${names.length} options)` : ""}`;
}

/** Paths as patterns, with many keys under one parent shortened to `parent.{a, b, …}` (the JSON has them all). */
function shortPaths(paths: string[]): string {
  const patterns = [...new Set(paths.map(pathPattern))].sort();
  const byParent = new Map<string, string[]>();
  for (const p of patterns) {
    const i = p.lastIndexOf(".");
    const parent = i < 0 ? "" : p.slice(0, i);
    byParent.set(parent, [...(byParent.get(parent) ?? []), i < 0 ? p : p.slice(i + 1)]);
  }
  return [...byParent]
    .map(([parent, keys]) =>
      keys.length > 4
        ? code(`${parent}.{${keys.slice(0, 3).join(", ")}, … ${keys.length} keys}`)
        : keys.map((k) => code(parent ? `${parent}.${k}` : k)).join(", "),
    )
    .join(", ");
}

/** One option as a Markdown list item: the keys it writes, its values or range, what a new aura has, where it is. */
function optionLine(e: OptionReferenceEntry, allTypes: number): string {
  const kind = [e.type, e.control].filter(Boolean).join(", ");
  const writes = [e.writes.length ? shortPaths(e.writes) : "", e.childWrites?.length ? `children: ${shortPaths(e.childWrites)}` : ""];
  const parts = [`- **${optionName(e)}** (\`${e.option.join(" / ")}\`, ${kind}) → ${writes.filter(Boolean).join("; ")}`];
  if (e.choices?.length) {
    const shown = e.choices
      .filter((c) => Object.keys(c.wrote).length > 0)
      .map((c) => `${plainText(c.label).trim()}: ${Object.entries(c.wrote).map(([k, v]) => `\`${pathPattern(k)}\`=${json(v)}`).join(", ")}`);
    parts.push(`choices: ${shown.slice(0, 12).join("; ")}${shown.length > 12 ? `; … (${shown.length})` : ""}`);
  } else if (e.values?.length) {
    const shown = e.values.map(([k, l]) => (String(k) === plainText(l).trim() ? json(k) : `${json(k)} (${plainText(l).trim()})`));
    parts.push(`values: ${shown.slice(0, 12).join(", ")}${shown.length > 12 ? `, … (${shown.length})` : ""}`);
  }
  if (e.type === "range") {
    const lo = e.softMin ?? e.min;
    const hi = e.softMax ?? e.max;
    parts.push(`range ${lo ?? "…"} to ${hi ?? "…"}${e.step ? ` step ${e.step}` : ""}${e.isPercent ? " (a fraction, shown as %)" : ""}`);
  }
  if (e.default !== undefined && e.default !== "") parts.push(`new aura: ${json(e.default)}`);
  const added = [...new Set(e.scopes.flatMap((s) => (s.added ? [s.added.name] : [])))];
  if (added.length) parts.push(`after ${added.join(" / ")}`);
  const after = [...new Set(e.scopes.flatMap((s) => (s.after ? [`${plainText(s.after.name).trim()}: ${plainText(s.after.choice).trim()}`] : [])))];
  if (after.length) parts.push(`after choosing ${after.slice(0, 3).join(" / ")}${after.length > 3 ? " / …" : ""}`);
  const types = [...new Set(e.scopes.map((s) => s.regionType))];
  if (types.length < allTypes && !e.scopes.some((s) => s.triggerType)) parts.push(`on ${types.join(", ")}`);
  return parts.join(" · ");
}

/**
 * The whole reference as Markdown: the path rules, key → options, then per tab every option that writes the table,
 * the Trigger tab also per trigger type and event. `addonName` titles it ("Musca Auras", "WeakAuras").
 */
export function optionReferenceMarkdown(origin: string, game: string, addonName: string, r: OptionReference): string {
  const urls = optionReferenceUrls(origin, game, r.ref);
  const label = new Map(r.tabs.map((t) => [t.key, t.label]));
  const groupOnly = (e: OptionReferenceEntry) => e.scopes.every((s) => s.regionType === "group" || s.regionType === "dynamicgroup");
  const lines = (list: OptionReferenceEntry[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    // Options of every display type first, a group's own after.
    for (const e of [...list.filter((x) => !groupOnly(x)), ...list.filter(groupOnly)]) {
      if (e.writes.length === 0 && !e.childWrites?.length) continue;
      const line = optionLine(e, r.regionTypes.length);
      if (seen.has(line)) continue;
      seen.add(line);
      out.push(line);
    }
    return out;
  };
  const tabs = r.tabs.map(({ key, label: tabLabel }) => {
    const tabEntries = r.entries.filter((e) => e.tab === key);
    const parts = [`### ${tabLabel} (\`${key}\`)\n\n${lines(tabEntries.filter((e) => e.scopes.some((s) => !s.triggerType))).join("\n") || "Nothing here writes the table."}`];
    if (key === "trigger") {
      for (const t of r.triggerTypes) {
        for (const event of t.events?.map(([e]) => String(e)) ?? [undefined]) {
          // Only what this trigger type and event add: the Trigger tab's own options are above.
          const these = tabEntries.filter(
            (e) => e.scopes.some((s) => s.triggerType === t.type && s.event === event) && !e.scopes.some((s) => !s.triggerType),
          );
          const body = lines(these);
          if (body.length) parts.push(`#### ${plainText(t.label)} (\`${t.type}\`)${event ? `: ${event}` : ""}\n\n${body.join("\n")}`);
        }
      }
    }
    return parts.join("\n\n");
  });
  return `# Option ↔ table reference: ${addonName} ${r.ref}

Which wago JSON keys each option of the window writes, and which options write each key. Generated from the addon:
every option (${r.entries.length} in all) was changed once through its own set() on a new aura from the addon's New
Aura, and the table compared before and after. The same data with every detail (descriptions, every value, per
display type, trigger type and event) is JSON: \`GET ${urls.json}\`. Options that write nothing (buttons that open a
dialog, editor-only switches) are only there.

${PATH_RULES}

Lists (JSON arrays): ${r.lists.map(code).join(", ")}.

## Key → options

${Object.keys(r.byPath)
  .sort()
  .map((p) => reverseLine(r, p, label))
  .join("\n")}

## Options → keys

Each line: **option** (its key path in the tab, type and control) → the keys it writes; then its values or range,
what a new aura has, and where it appears (after an Add button, after a choice, on some display types only).

${tabs.join("\n\n")}
`;
}
