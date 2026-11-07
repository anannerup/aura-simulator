/**
 * Generates src/core/addon-vm/client-data.json: the WoW Forever client data the addon VM's client profile answers
 * (classes, instance difficulties, item sub classes, class talents), from wago.tools' DB2 exports of the latest
 * Forever build (product `wowf`). Data only: names and numeric icon FileDataIDs, no art.
 *
 *   node scripts/client-data.ts [build]
 */
import { writeFileSync } from "node:fs";
import { parseCsvRecords } from "../src/server/spells/csv.ts";

const WAGO = "https://wago.tools";
const OUT = new URL("../src/core/addon-vm/client-data.json", import.meta.url);

async function text(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return res.text();
}

const build =
  process.argv[2] ??
  ((JSON.parse(await text(`${WAGO}/api/builds/latest`)) as Record<string, { version?: string }>).wowf?.version as string);
if (!build) throw new Error("wago.tools lists no wowf build");
const table = async (name: string) => parseCsvRecords(await text(`${WAGO}/db2/${name}/csv?build=${encodeURIComponent(build)}`));

const [classes, difficulties, subClasses, talents, tabs, spellNames, spellMisc] = await Promise.all(
  ["ChrClasses", "Difficulty", "ItemSubClass", "Talent", "TalentTab", "SpellName", "SpellMisc"].map(table),
);

const num = (s: string | undefined) => Number(s ?? 0);
const names = new Map(spellNames.map((r) => [num(r.ID), r.Name_lang]));
const icons = new Map<number, number>();
for (const r of spellMisc) if (num(r.DifficultyID) === 0 && !icons.has(num(r.SpellID))) icons.set(num(r.SpellID), num(r.SpellIconFileDataID));

const classList = classes
  .map((r) => ({ id: num(r.ID), file: r.Filename, name: r.Name_lang }))
  .sort((a, b) => a.id - b.id);

// Talents per class as GetTalentInfo(tab, index) lists them: tabs by OrderIndex, talents by tier then column.
const talentsByClass: Record<string, { tab: number; index: number; name: string; icon: number; tier: number; column: number; maxRank: number }[]> = {};
for (const c of classList) {
  const classTabs = tabs.filter((t) => (num(t.ClassMask) & (1 << (c.id - 1))) !== 0).sort((a, b) => num(a.OrderIndex) - num(b.OrderIndex));
  const list: (typeof talentsByClass)[string] = [];
  classTabs.forEach((t, tabIndex) => {
    talents
      .filter((r) => num(r.TabID) === num(t.ID))
      .sort((a, b) => num(a.TierID) - num(b.TierID) || num(a.ColumnIndex) - num(b.ColumnIndex))
      .forEach((r, i) => {
        const ranks = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => num(r[`SpellRank_${k}`])).filter((id) => id > 0);
        const spell = ranks[0];
        if (!spell || !names.has(spell)) return;
        list.push({ tab: tabIndex + 1, index: i + 1, name: names.get(spell)!, icon: icons.get(spell) ?? 134400, tier: num(r.TierID) + 1, column: num(r.ColumnIndex) + 1, maxRank: ranks.length });
      });
  });
  talentsByClass[c.file] = list;
}

const data = {
  source: `wago.tools DB2 exports, WoW Forever build ${build} (product wowf); scripts/client-data.ts`,
  build,
  classes: classList,
  talentTabs: Object.fromEntries(
    classList.map((c) => [
      c.file,
      tabs
        .filter((t) => (num(t.ClassMask) & (1 << (c.id - 1))) !== 0)
        .sort((a, b) => num(a.OrderIndex) - num(b.OrderIndex))
        .map((t) => ({ name: t.Name_lang, icon: num(t.SpellIconID) })),
    ]),
  ),
  talents: talentsByClass,
  difficulties: difficulties
    .map((r) => ({ id: num(r.ID), name: r.Name_lang, instanceType: num(r.InstanceType), maxPlayers: num(r.MaxPlayers) }))
    .sort((a, b) => a.id - b.id),
  itemSubClasses: subClasses
    .filter((r) => num(r.ClassID) === 2 || num(r.ClassID) === 4)
    .map((r) => ({ classId: num(r.ClassID), subClassId: num(r.SubClassID), name: r.VerboseName_lang || r.DisplayName_lang }))
    .sort((a, b) => a.classId - b.classId || a.subClassId - b.subClassId),
};
writeFileSync(OUT, JSON.stringify(data, null, 1) + "\n");
console.log(`wrote ${OUT.pathname}: ${classList.length} classes, ${Object.values(talentsByClass).flat().length} talents, ${data.difficulties.length} difficulties`);
