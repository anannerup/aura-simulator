/**
 * The option ↔ table reference (core.optionReference()) as Markdown, for every game's agent docs: the docs section
 * (what it is, how its paths read as wago JSON keys, a few generated examples, where the whole reference is) and the
 * whole reference in both directions, split into parts an agent fetches one at a time: an index
 * (/<game>/docs/agents/options.md) and one file per part (/<game>/docs/agents/options/<part>.md: key → options; each
 * tab; the Display tab per display type; the Trigger tab per trigger type). Nothing is shortened: every value, choice
 * and key is listed. Pure; the server loads the reference (`src/server/option-reference.ts`).
 */
import { pathPattern, plainText, type OptionReference, type OptionReferenceEntry } from "@/core";

const code = (s: string) => `\`${s}\``;
const json = (v: unknown) => JSON.stringify(v);

/** Where a game's reference is served, next to its agent docs. */
export function optionReferenceUrls(origin: string, game: string, ref: string) {
  const q = `?ref=${encodeURIComponent(ref)}`;
  return {
    md: `${origin}/${game}/docs/agents/options.md${q}`,
    json: `${origin}/${game}/docs/agents/options.json${q}`,
    part: (name: string) => `${origin}/${game}/docs/agents/options/${name}.md${q}`,
  };
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

/** How the reference writes table paths (in the docs section and on the whole reference's index). */
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

- **The whole reference, both directions, as Markdown:** \`GET ${urls.md}\` is its index; it links one file per
  part, each complete (every value and choice): key → options (\`${urls.part("keys")}\`), each tab
  (\`${urls.part("load")}\`, \`${urls.part("conditions")}\`, …), the Display tab per display type
  (\`${urls.part("region-icon")}\`) and the Trigger tab per trigger type (\`${urls.part("trigger-aura2")}\`).
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

/** `Display › Desaturate; …` for a path pattern of the reverse index: every option that writes it. */
function reverseLine(r: OptionReference, pattern: string, label: Map<string, string>, index = r.byPath): string {
  const names = [...new Set(index[pattern].map((i) => `${label.get(r.entries[i].tab) ?? r.entries[i].tab} › ${optionName(r.entries[i])}`))];
  return `- \`${pattern}\` ← ${names.join("; ")}`;
}

/** Paths as patterns, sorted, each in full. */
function patterns(paths: string[]): string {
  return [...new Set(paths.map(pathPattern))].sort().map(code).join(", ");
}

const isGroupType = (regionType: string) => regionType === "group" || regionType === "dynamicgroup";

/**
 * One option as a Markdown list item: the keys it writes, all its values or its range, what a new aura has, where it
 * is. `showTypes`: say which display types it is on when not all (left out in a file of one display type).
 */
function optionLine(e: OptionReferenceEntry, allTypes: number, showTypes = true): string {
  const kind = [e.type, e.control].filter(Boolean).join(", ");
  const writes = [e.writes.length ? patterns(e.writes) : "", e.childWrites?.length ? `children: ${patterns(e.childWrites)}` : ""];
  const parts = [`- **${optionName(e)}** (\`${e.option.join(" / ")}\`, ${kind}) → ${writes.filter(Boolean).join("; ")}`];
  if (e.choices?.length) {
    const shown = e.choices
      .filter((c) => Object.keys(c.wrote).length > 0)
      .map((c) => `${plainText(c.label).trim()}: ${Object.entries(c.wrote).map(([k, v]) => `\`${pathPattern(k)}\`=${json(v)}`).join(", ")}`);
    parts.push(`choices: ${shown.join("; ")}`);
  } else if (e.values?.length) {
    const shown = e.values.map(([k, l]) => (String(k) === plainText(l).trim() ? json(k) : `${json(k)} (${plainText(l).trim()})`));
    parts.push(`values: ${shown.join(", ")}`);
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
  if (after.length) parts.push(`after choosing ${after.join(" / ")}`);
  const types = [...new Set(e.scopes.map((s) => s.regionType))];
  if (showTypes && types.length < allTypes && !e.scopes.some((s) => s.triggerType)) parts.push(`on ${types.join(", ")}`);
  return parts.join(" · ");
}

/** The options of `list` that write the table, each once: those of every display type first, a group's own after. */
function optionLines(r: OptionReference, list: OptionReferenceEntry[], showTypes = true): string[] {
  const groupOnly = (e: OptionReferenceEntry) => e.scopes.every((s) => isGroupType(s.regionType));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of [...list.filter((x) => !groupOnly(x)), ...list.filter(groupOnly)]) {
    if (e.writes.length === 0 && !e.childWrites?.length) continue;
    const line = optionLine(e, r.regionTypes.length, showTypes);
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/** One file of the whole reference: its name (`options/<name>.md`), title and what it holds. */
export interface OptionReferencePart {
  name: string;
  title: string;
  /** What is in it, for the index. */
  about: string;
}

/** A key as a file name. */
const slug = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_");

/** The parts the whole reference is split into, in the index's order. */
export function optionReferenceParts(r: OptionReference): OptionReferencePart[] {
  const parts: OptionReferencePart[] = [
    { name: "keys", title: "Key → options", about: "every table key (as a path pattern) and the options that write it" },
  ];
  for (const { key, label } of r.tabs) {
    if (key === "region") {
      for (const t of r.regionTypes) parts.push({ name: `region-${slug(t)}`, title: `${label} of ${code(t)}`, about: `the ${label} tab of a ${code(t)}` });
    } else if (key === "trigger") {
      parts.push({ name: "trigger", title: label, about: "what every trigger has (its type, …)" });
      for (const t of r.triggerTypes) {
        parts.push({
          name: `trigger-${slug(t.type)}`,
          title: `${label}: ${plainText(t.label)} (${code(t.type)})`,
          about: `what a ${code(t.type)} trigger adds${t.events?.length ? `, per event: ${t.events.map(([e]) => String(e)).join(", ")}` : ""}`,
        });
      }
    } else {
      parts.push({ name: slug(key), title: `${label} (${code(key)})`, about: `the ${label} tab` });
    }
  }
  return parts;
}

/** The whole reference's index: what it is, how to read paths, and its parts. */
export function optionReferenceMarkdown(origin: string, game: string, addonName: string, r: OptionReference): string {
  const urls = optionReferenceUrls(origin, game, r.ref);
  return `# Option ↔ table reference: ${addonName} ${r.ref}

Which wago JSON keys each option of the window writes, and which options write each key. Generated from the addon:
every option (${r.entries.length} in all) was changed once through its own set() on a new aura from the addon's New
Aura, and the table compared before and after. The same data with every detail (descriptions, per display type,
trigger type and event) is JSON: \`GET ${urls.json}\`. Options that write nothing (buttons that open a dialog,
editor-only switches) are only there.

${PATH_RULES}

Lists (JSON arrays): ${r.lists.map(code).join(", ")}.

## Parts

Each part is a Markdown file on its own; fetch the ones you need. Each option line: **option** (its key path in the
tab, type and control) → the keys it writes; then all its values or its range, what a new aura has, and where it
appears (after an Add button, after a choice, on some display types only).

${optionReferenceParts(r)
  .map((p) => `- ${p.title}: \`GET ${urls.part(p.name)}\` (${p.about})`)
  .join("\n")}
`;
}

/**
 * The Trigger tab's options with a trigger type chosen (on an icon): for a type with events, what every event has,
 * then what each event adds; otherwise one untitled section.
 */
function triggerTypeSections(
  r: OptionReference,
  trigger: OptionReferenceEntry[],
  t: OptionReference["triggerTypes"][number],
): { title?: string; lines: string[] }[] {
  const events = t.events?.map(([e]) => String(e)) ?? [undefined];
  const perEvent = events.map((event) => trigger.filter((e) => e.scopes.some((s) => s.triggerType === t.type && s.event === event)));
  if (events.length === 1) return [{ lines: optionLines(r, perEvent[0]) }];
  const common = perEvent[0].filter((e) => perEvent.every((list) => list.includes(e)));
  return [
    { title: "Every event", lines: optionLines(r, common) },
    ...events.map((event, i) => ({ title: `${event}`, lines: optionLines(r, perEvent[i].filter((e) => !common.includes(e))) })),
  ];
}

/** One part of the whole reference (`optionReferenceParts`) as Markdown; null for a name that isn't one. */
export function optionReferencePartMarkdown(origin: string, game: string, addonName: string, r: OptionReference, name: string): string | null {
  const part = optionReferenceParts(r).find((p) => p.name === name);
  if (!part) return null;
  const urls = optionReferenceUrls(origin, game, r.ref);
  const label = new Map(r.tabs.map((t) => [t.key, t.label]));
  const head = `# ${part.title}: ${addonName} ${r.ref}

Part of the option ↔ table reference (its index, with how to read paths: \`GET ${urls.md}\`).
`;
  const body = (lines: string[]) => lines.join("\n") || "Nothing here writes the table.";
  const ownScope = (e: OptionReferenceEntry) => e.scopes.some((s) => !s.triggerType);
  if (name === "keys") {
    const children = Object.keys(r.byChildPath).sort();
    return `${head}
${Object.keys(r.byPath)
  .sort()
  .map((p) => reverseLine(r, p, label))
  .join("\n")}
${children.length ? `\n## Keys a group's options write in each child\n\n${children.map((p) => reverseLine(r, p, label, r.byChildPath)).join("\n")}\n` : ""}`;
  }
  if (name.startsWith("region-")) {
    const regionType = r.regionTypes.find((t) => `region-${slug(t)}` === name)!;
    const these = r.entries.filter((e) => e.tab === "region" && e.scopes.some((s) => s.regionType === regionType && !s.triggerType));
    return `${head}\n${body(optionLines(r, these, false))}\n`;
  }
  const trigger = r.entries.filter((e) => e.tab === "trigger");
  if (name === "trigger") {
    // The Trigger tab as other displays' new auras show it, where it differs from what the trigger types' parts list.
    const inTypes = new Set(r.triggerTypes.flatMap((t) => triggerTypeSections(r, trigger, t).flatMap((s) => s.lines)));
    const rest = optionLines(r, trigger.filter(ownScope)).filter((line) => !inTypes.has(line));
    return `${head}
The trigger's own options are in each trigger type's part (a new aura's trigger is \`aura2\`: \`GET ${urls.part("trigger-aura2")}\`).
${rest.length ? `Where the Trigger tab writes something else on some display types:\n\n${rest.join("\n")}` : ""}
`;
  }
  if (name.startsWith("trigger-")) {
    const t = r.triggerTypes.find((x) => `trigger-${slug(x.type)}` === name)!;
    const sections = triggerTypeSections(r, trigger, t);
    return `${head}\n${sections.map((s) => (s.title ? `## ${s.title}\n\n${body(s.lines)}` : body(s.lines))).join("\n\n")}\n`;
  }
  const tab = r.tabs.find((t) => slug(t.key) === name)!;
  return `${head}\n${body(optionLines(r, r.entries.filter((e) => e.tab === tab.key && ownScope(e))))}\n`;
}
