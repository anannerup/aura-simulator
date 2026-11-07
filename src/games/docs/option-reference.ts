/**
 * The option ↔ table reference (core.optionReference()) as Markdown, for every game's agent docs: the docs section
 * (what it is, how its paths read as wago JSON keys, a few generated examples, where the whole reference is) and the
 * whole reference in both directions, split into parts an agent fetches one at a time: an index
 * (/<game>/docs/agents/options.md) and one file per part (/<game>/docs/agents/options/<part>.md: key → options; each
 * tab; the Display tab per display type; the Trigger tab per trigger type; the Conditions tab's checks per trigger
 * type and its properties per display type). Nothing is shortened: every value, choice
 * and key is listed. Pure; the server loads the reference (`src/server/option-reference.ts`).
 */
import {
  pathPattern,
  plainText,
  type ConditionCheck,
  type ConditionCheckSet,
  type ConditionField,
  type ConditionProperty,
  type OptionReference,
  type OptionReferenceEntry,
  type OptionSetting,
} from "@/core";

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

/** A setting of another option in words: `section "Texture 1" opened`, `**Anchor Mode** "point" (Attach to Point)`. */
function settingText(s: OptionSetting): string {
  if (s.section) return `section "${s.name}" is opened`;
  const label = s.label !== undefined && s.label !== String(s.value) ? ` (${s.label})` : "";
  const section = s.openSections?.length ? `${s.openSections.map((x) => `section "${x.name}"`).join(" and ")} is opened and ` : "";
  return `${section}**${s.name}** (\`${s.option.join(" / ")}\`) is ${json(s.value)}${label}`;
}

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
  (\`${urls.part("region-icon")}\`), the Trigger tab per trigger type (\`${urls.part("trigger-aura2")}\`), and the
  Conditions tab's checks per trigger type (\`${urls.part("conditions-trigger-aura2")}\`) and properties per display
  type (\`${urls.part("conditions-display-icon")}\`).
- **As JSON, the conditions:** \`conditions\` in the JSON below (\`checks\` per trigger type and event, \`global\`,
  \`properties\` per display type).
- **As JSON:** \`GET ${urls.json}\` (\`entries\`: every option per display type, trigger type, event, added part and
  choice, with its \`writes\`, \`values\`, range, \`default\`, \`desc\`; for selects whose choice writes more than its
  own key (a condition's If, Grow with \`selfPoint\`), what each choice writes (\`choices\`); for options the window
  hides on a new aura, what shows each (\`shownBy\`: a section opened, or another option's value with \`openSections\` opened too); and the other names
  an option has in another mode (\`modes\`: e.g. a sub element's \`xOffset\` is "Extra Width" with Anchor Mode "Fill
  Area" and "X Offset" with "Attach to Point"); \`byPath\`: path pattern → entry indices; \`lists\`: the tables that
  are JSON arrays).

The first request for a version waits while the reference is generated (a few minutes, once per version).

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
  if (e.hidden) parts.push(e.shownBy?.length ? `hidden until ${e.shownBy.map(settingText).join(" or ")}` : "hidden (no single setting shows it)");
  for (const m of e.modes ?? []) parts.push(`named **${plainText(m.name).trim()}** when ${settingText(m.when)}${m.desc ? ` (${plainText(m.desc).trim()})` : ""}`);
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
      if (key === "conditions") parts.push(...conditionParts(r, label));
    }
  }
  return parts;
}

/** The Conditions tab's generated parts: every check per trigger type, every property per display type. */
function conditionParts(r: OptionReference, label: string): OptionReferencePart[] {
  const types = r.triggerTypes.filter((t) => r.conditions.checks.some((c) => c.triggerType === t.type));
  const displays = [...new Set(r.conditions.properties.map((p) => p.regionType))];
  return [
    ...types.map((t) => ({
      name: `conditions-trigger-${slug(t.type)}`,
      title: `${label}: checks of ${plainText(t.label)} (${code(t.type)})`,
      about: `every "If" check (condition variable) of trigger type ${code(t.type)}${t.events?.length ? ", per event" : ""}, with its keys, value type, operators and values, and the global checks`,
    })),
    ...displays.map((d) => ({
      name: `conditions-display-${slug(d)}`,
      title: `${label}: properties of ${code(d)}`,
      about: `every "Then" property a condition can change on display type ${code(d)} and its sub elements, with its keys and value`,
    })),
  ];
}

/**
 * Where a condition's checks and properties are, for the agent docs' Conditions section: the parts per trigger type
 * and per display type, by name (every one when the reference is ready).
 */
export function conditionPartsPointer(origin: string, game: string, ref: string, r: OptionReference | null): string {
  const urls = optionReferenceUrls(origin, game, ref);
  const list = (prefix: string, names: string[]) => names.map((n) => code(`${prefix}${slug(n)}`)).join(", ");
  const types = r ? [...new Set(r.conditions.checks.map((c) => c.triggerType))] : [];
  const displays = r ? [...new Set(r.conditions.properties.map((p) => p.regionType))] : [];
  return `- **Every check (condition variable) of a trigger type** is in its part of the option ↔ table reference:
  \`GET ${urls.part("conditions-trigger-<trigger type>")}\` (e.g. \`${urls.part("conditions-trigger-aura2")}\`${
    types.length ? `; parts: ${list("conditions-trigger-", types)}` : ""
  }). Per event, each "If" choice with the \`check.variable\` it writes, its value type, \`op\` choices and \`value\`
  choices, and the Trigger tab option that must be set first when the check is only offered then (e.g. "Aura(s)
  Found", \`buffed\`, needs Show On "Always"). The global checks are at its end.
- **Every property (\`changes[].property\`) of a display type and its sub elements:**
  \`GET ${urls.part("conditions-display-<display type>")}\`${displays.length ? ` (${list("conditions-display-", displays)})` : ""}, with
  the value each takes.`;
}

/** A condition field's value in words: its type and what it takes. */
function fieldValue(f: ConditionField): string {
  const choices = (values: [unknown, string][]) =>
    values.map(([k, l]) => (String(k) === plainText(l).trim() ? json(k) : `${json(k)} (${plainText(l).trim()})`)).join(", ");
  switch (f.type) {
    case "toggle":
      return "true or false";
    case "color":
      return "a colour `[r, g, b, a]`, 0..1";
    case "range": {
      const lo = f.softMin ?? f.min;
      const hi = f.softMax ?? f.max;
      return `a number ${lo ?? "…"} to ${hi ?? "…"}${f.step ? ` step ${f.step}` : ""}${f.isPercent ? " (a fraction, shown as %)" : ""}`;
    }
    case "select":
      return `one of ${choices(f.values ?? [])}`;
    case "multiselect":
      return `any of ${choices(f.values ?? [])}`;
    case "input":
      if (f.multiline) return "text (code)";
      return f.probe?.value === "5" ? 'a number, written as text (e.g. `"5"`)' : "text";
  }
  return f.type;
}

/** A field's keys and value, e.g. `` `conditions.#.check.range` (Range in yards): a number ``. */
function fieldLine(f: ConditionField): string {
  const name = plainText(f.name ?? "").trim();
  const desc = plainText(f.desc ?? "").trim();
  return `${patterns(f.writes)}${name ? ` (${name})` : ""}: ${fieldValue(f)}${desc ? ` (${desc})` : ""}`;
}

const keyLabel = ([k, l]: [unknown, string]) => (String(k) === plainText(l).trim() ? code(String(k)) : `${code(String(k))} (${plainText(l).trim()})`);

/** A check as a Markdown list item: what it writes, its value, other fields, what must be set first. */
function checkLine(c: ConditionCheck): string {
  const variable = c.variable !== undefined ? ` → \`check.variable\` ${json(c.variable)}` : "";
  const parts = [`- **${c.label}**${variable}`];
  const op = (c.operators ?? []).map(keyLabel).join(", ");
  const choices = (c.values ?? []).map(([k, l]) => `${json(k)} (${plainText(l).trim()})`).join(", ");
  switch (c.valueType) {
    case "bool":
      parts.push("bool: `value` 1 (true) or 0 (false), no `op`");
      break;
    case "number":
      parts.push(`number: \`op\` ${op || "none"}; \`value\` a number as text (e.g. \`"5"\`)`);
      break;
    case "text":
      parts.push(`text: ${op ? `\`op\` ${op}; ` : "no `op`; "}\`value\` text`);
      break;
    case "select":
      parts.push(`${op ? `\`op\` ${op}; ` : ""}\`value\` one of ${choices}`);
      break;
    case "none":
      parts.push("no `op` or `value` in the window");
      break;
  }
  const isOpOrValue = (f: ConditionField) => f.writes.every((p) => /\.check\.(op|value)$/.test(p));
  const others = c.fields.filter((f) => c.valueType === "other" || !isOpOrValue(f));
  if (others.length) parts.push(`fields: ${others.map(fieldLine).join("; ")}`);
  if (c.requires) {
    const wrote = Object.entries(c.requires.wrote)
      .map(([k, v]) => `\`${pathPattern(k)}\`=${json(v)}`)
      .join(", ");
    parts.push(`needs a Trigger setting, e.g. **${c.requires.name}** ${json(c.requires.value)}${wrote ? ` (${wrote})` : ""}`);
  }
  return parts.join(" · ");
}

/** A property as a Markdown list item: the property it writes and its value's fields. */
function propertyLine(p: ConditionProperty): string {
  const writes = p.property !== undefined ? `\`property\` ${json(p.property)}` : patterns(Object.keys(p.wrote)) || "(removes the change)";
  const head = `- **${p.label}** → ${writes}`;
  if (p.fields.length === 0) return head;
  const plain = p.fields.length === 1 && p.fields[0].writes.length === 1 && /\.changes\.\d+\.value$/.test(p.fields[0].writes[0]);
  return `${head} · ${plain ? `\`value\`: ${fieldValue(p.fields[0])}` : `value fields: ${p.fields.map(fieldLine).join("; ")}`}`;
}

/** The checks of a trigger type's events: those every event has, then each event's own. */
function checkSections(sets: ConditionCheckSet[]): { title?: string; lines: string[] }[] {
  if (sets.length === 1) return [{ lines: sets[0].checks.map(checkLine) }];
  const per = sets.map((s) => s.checks.map(checkLine));
  const common = per[0].filter((line) => per.every((lines) => lines.includes(line)));
  return [
    { title: "Every event", lines: common },
    ...sets.map((s, i) => ({ title: s.event ?? "", lines: per[i].filter((line) => !common.includes(line)) })),
  ];
}

const CONDITION_KEYS = `A condition is \`{"check": {…}, "changes": [{"property": …, "value": …}]}\` in the aura's \`conditions\` array.
The lines show what the window writes on condition 1 (\`conditions.1.check.…\`, \`conditions.1.changes.1.…\`); every
condition and change takes the same keys.`;

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
tab, type and control) → the keys it writes; then all its values or its range (a select whose choices write more
than its own key lists what each choice writes: Grow also sets \`selfPoint\`), what a new aura has, what shows it
when the window hides it on a new aura ("hidden until" a section is opened or another option has a value), the other
names it has while another option has a value (the same key meaning something else in that mode: a sub element's
"Extra Width" is its "X Offset" once Anchor Mode is "Attach to Point"), and where it appears (after an Add button,
after a choice, on some display types only).

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
  if (name.startsWith("conditions-trigger-")) {
    const t = r.triggerTypes.find((x) => `conditions-trigger-${slug(x.type)}` === name)!;
    const sets = r.conditions.checks.filter((c) => c.triggerType === t.type);
    const custom = (r.byPath["triggers.#.trigger.customVariables"] ?? []).some((i) => r.entries[i].scopes.some((s) => s.triggerType === t.type));
    const typeLabel = plainText(t.label);
    return `${head}
Every check a condition's "If" offers for the ${typeLabel} trigger (\`${t.type}\`), probed on trigger 1 of display type
\`${r.conditions.regionType}\`: the choice's label → the \`check.variable\` it writes (with \`check.trigger\`: the trigger's
number), then what \`check.op\` and \`check.value\` take. A check marked "needs a Trigger setting" is offered only when
the trigger is set up differently from a new one; the line names one Trigger tab option and value that offers it
(probed one option at a time from a new trigger): write those keys too, or the addon doesn't offer the check.${
      custom
        ? `\n\nThe ${typeLabel} trigger also offers the variables its Custom Variables code declares
(\`triggers.N.trigger.customVariables\`); they depend on that code, so they aren't listed here.`
        : ""
    }

${CONDITION_KEYS}

${checkSections(sets)
  .map((s) => (s.title !== undefined ? `## ${s.title}\n\n${body(s.lines)}` : body(s.lines)))
  .join("\n\n")}

## Global checks and combinations (any aura)

${body(r.conditions.global.map(checkLine))}
`;
  }
  if (name.startsWith("conditions-display-")) {
    const sets = r.conditions.properties.filter((p) => `conditions-display-${slug(p.regionType)}` === name);
    const regionType = sets[0].regionType;
    const section = (p: (typeof sets)[number]) => {
      const subs = p.subRegions.map((x) => `\`sub.${x.index}\` ${x.type}`).join(", ");
      return `${sets.length > 1 ? `## After ${plainText(p.added.name)}\n\n` : ""}Probed with these sub elements: ${subs || "none"}.
\`sub.N.<key>\` is the aura's N-th \`subRegions\` element: use your aura's own numbers. A sub element's properties exist
only on an aura that has one.

${body(p.properties.map(propertyLine))}`;
    };
    return `${head}
Every property a condition's "Then" can change on display type \`${regionType}\` (with one sub element of every kind it adds):
the choice's label → the \`changes[].property\` it writes, and what \`changes[].value\` takes.

${CONDITION_KEYS}

${sets.map(section).join("\n\n")}
`;
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
  const note =
    tab.key === "conditions"
      ? `\nThe "If" choices here are those of a new aura's trigger. Every trigger type's checks: \`GET ${urls.part("conditions-trigger-<trigger type>")}\`; every display type's properties: \`GET ${urls.part("conditions-display-<display type>")}\` (each listed in the index).\n`
      : "";
  return `${head}${note}\n${body(optionLines(r, r.entries.filter((e) => e.tab === tab.key && ownScope(e))))}\n`;
}
