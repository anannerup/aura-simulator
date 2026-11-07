/**
 * The TBC v1 auras (ticket 08): each passes WeakAuras2's import and validation with no problems, does in the
 * situation evaluation what it promises, and is written to `.scratch/tbc-anniversary/v1-auras/` as the import string
 * (`.txt`) and wago JSON (`.json`) the window exports. `WRITE_V1_AURAS=1 npm test -- tbc-v1-auras` rewrites the files.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  canonicalize,
  loadAddon,
  previewSituation,
  readSituation,
  toWagoJson,
  type AuraCore,
  type AuraDocument,
  type AuraState,
} from "@/core";
import { TBC_V1_AURAS } from "@/games/tbc/examples";
import { TBC_TEST_VERSION, weakAuras2Available, weakAuras2Fetcher } from "../support/weakauras2";

const DIR = path.resolve(__dirname, "../../.scratch/tbc-anniversary/v1-auras");
let core: AuraCore | undefined;

beforeAll(async () => {
  if (!(await weakAuras2Available())) return;
  core = await loadAddon(TBC_TEST_VERSION, { fetchSource: weakAuras2Fetcher(), game: "tbc", fullAddon: "inline" });
}, 180_000);
afterAll(() => core?.dispose());

const stateOf = (body: { aura: Record<string, unknown>; children: Record<string, unknown>[] }): AuraState => ({
  aura: canonicalize(body.aura as AuraDocument) as AuraDocument,
  children: body.children.map((c) => canonicalize(c as AuraDocument) as AuraDocument),
});

/** What the display `id` shows in a situation (TBC rules). */
const shows = (body: Parameters<typeof stateOf>[0], situation: unknown, id = String(body.aura.id)) =>
  previewSituation(stateOf(body), readSituation(situation, "tbc"), "tbc").displays.find((d) => d.id === id)!;

describe("TBC v1 auras", () => {
  test.each(Object.keys(TBC_V1_AURAS))("%s: the addon imports it and validates it with no problems", async (name) => {
    if (!core) return;
    const state = stateOf(TBC_V1_AURAS[name]);
    expect(await core.importCheck(state)).toEqual({ importable: true });
    const result = await core.validate(state);
    expect({ errors: result.errors, warnings: result.warnings }).toEqual({ errors: [], warnings: [] });
    expect(result.combat).toBeUndefined();
  });

  test("1a shows desaturated only under 3 minutes, glowing under 30 seconds, its time red under 10", () => {
    const a = TBC_V1_AURAS["1a buff under 3 min"];
    expect(shows(a, { triggers: { "1": { remaining: 1800, duration: 3600 } } }).shown).toBe(false);
    const low = shows(a, { triggers: { "1": { remaining: 120, duration: 3600 } } });
    expect(low).toMatchObject({ shown: true, activeConditions: [], glows: [{ subRegion: 3, lit: false }] });
    const lower = shows(a, { triggers: { "1": { remaining: 8, duration: 3600 } } });
    expect(lower).toMatchObject({ shown: true, activeConditions: [1, 2], glows: [{ subRegion: 3, lit: true }] });
    expect(lower.changed).toEqual({ "sub.3.glow": true, "sub.2.text_color": [1, 0.2, 0.2, 1] });
    expect(shows(a, { triggers: { "1": { present: false } } }).shown).toBe(false);
  });

  test("1b shows only while the buff is missing; 2 greys out on cooldown; 3 shows while the target has it", () => {
    const b = TBC_V1_AURAS["1b buff missing"];
    expect(shows(b, {}).shown).toBe(false);
    expect(shows(b, { triggers: { "1": { present: false } } })).toMatchObject({ shown: true, glows: [{ subRegion: 2, lit: true }] });
    const cd = TBC_V1_AURAS["2 cooldown icon"];
    expect(shows(cd, { triggers: { "1": { present: false } } })).toMatchObject({ shown: true, changed: {} });
    expect(shows(cd, { triggers: { "1": { remaining: 5, duration: 8 } } })).toMatchObject({ shown: true, changed: { desaturate: true } });
    const bar = TBC_V1_AURAS["3 target debuff bar"];
    expect(shows(bar, { triggers: { "1": { remaining: 12, duration: 18 } } }).shown).toBe(true);
    expect(shows(bar, { targetExists: false }).shown).toBe(false);
    expect(shows(bar, { triggers: { "1": { remaining: 3, duration: 18 } } }).changed).toEqual({ "sub.4.text_color": [1, 0.2, 0.2, 1] });
    // In combat nothing changes on TBC.
    expect(shows(bar, { inCombat: true, triggers: { "1": { remaining: 3, duration: 18 } } }).shown).toBe(true);
  });

  test("are written as .txt (import string) and .json (wago JSON) in .scratch/tbc-anniversary/v1-auras", async () => {
    if (!core) return;
    if (process.env.WRITE_V1_AURAS) mkdirSync(DIR, { recursive: true });
    for (const [name, body] of Object.entries(TBC_V1_AURAS)) {
      const code = core.encode(stateOf(body));
      const json = toWagoJson(core.decode(code));
      const txt = path.join(DIR, `${name}.txt`);
      if (process.env.WRITE_V1_AURAS) {
        writeFileSync(txt, `${code}\n`);
        writeFileSync(path.join(DIR, `${name}.json`), `${json}\n`);
      }
      expect(existsSync(txt), `${txt} (WRITE_V1_AURAS=1 writes it)`).toBe(true);
      // The file decodes to the same aura (encoding may differ in bytes between runs of the encoder, not in content).
      expect(core.decode(readFileSync(txt, "utf8").trim())).toEqual(core.decode(code));
      expect(readFileSync(path.join(DIR, `${name}.json`), "utf8").trim()).toBe(json);
    }
  });
});
