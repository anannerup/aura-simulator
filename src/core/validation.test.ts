import { beforeAll, describe, expect, test } from "vitest";
import { AddonContractError, getField, loadAddon, sampleIconAura, type AuraCore, type AuraDocument, type AuraState } from "@/core";
import { cachedAddonFetcher } from "../../tests/support/addon-source";
import { aura2SpellIds, modernDesaturateBad, modernGlowOk, modernRemainingWindowOk } from "../../tests/fixtures/auras";

const REF = "v1.15.0";
const fetchSource = cachedAddonFetcher(REF);
let core: AuraCore;

beforeAll(async () => {
  core = await loadAddon(REF, { fetchSource });
  await core.loadFullAddon();
}, 120_000);

const single = (aura: AuraDocument): AuraState => ({ aura, children: [] });

/** The addon's own Forever tutorial import strings, decoded. */
async function tutorialStates(): Promise<AuraState[]> {
  const src = await fetchSource("WeakAuras/ForeverTutorial.lua");
  return [...src.matchAll(/import = "(!WA:2![^"]+)"/g)].map((m) => core.decode(m[1]));
}

describe("the full addon", () => {
  test("loads every file of both addons and finishes login", async () => {
    const report = await core.loadFullAddon();
    expect(report.loginFinished).toBe(true);
    expect(report.files).toBeGreaterThan(250);
    // Known harmless failures: addon comms (Chomp) and the minimap button, both in login handlers.
    expect(report.fileErrors).toEqual([]);
  });
});

describe("fillDefaults", () => {
  test("fills defaults from the addon's tables and sets the addon's internalVersion", async () => {
    const { aura } = await core.fillDefaults(single(modernGlowOk));
    expect(aura.internalVersion).toBe(core.internalVersion);
    // icon region defaults
    expect(aura.desaturate).toBe(false);
    expect(aura.anchorPoint).toBe("CENTER");
    expect(aura.alpha).toBe(1);
    // data_stub defaults
    expect(getField(aura, "load")).toBeTruthy();
    // sub-region defaults (glow)
    const glow = (aura.subRegions as AuraDocument[])[1];
    expect(glow.type).toBe("subglow");
    expect(glow.glowColor).toBeTruthy();
    // what the agent wrote is kept
    expect(aura.width).toBe(48);
  });

  test("migrates the tutorial auras from older internal versions", async () => {
    for (const state of await tutorialStates()) {
      const filled = await core.fillDefaults(state);
      for (const aura of [filled.aura, ...filled.children]) expect(aura.internalVersion).toBe(core.internalVersion);
      const result = await core.validate(state);
      expect(result.errors.filter((e) => e.code === "defaults.error")).toEqual([]);
    }
  });
});

describe("validate", () => {
  test("a known-good Aura (Modern) is fully usable in combat", async () => {
    const result = await core.validate(single(modernGlowOk));
    expect(result.errors).toEqual([]);
    expect(result.combat?.status).toBe("ok");
    expect(result.combat?.messages[0]).toBe("Fully usable in combat.");
    expect(result.warnings.map((w) => w.message)).toContain("Glow starts once the aura's duration is known.");
  });

  test("a remaining-time condition driving desaturate is broken, pointing at the change", async () => {
    const result = await core.validate(single(modernDesaturateBad));
    expect(result.combat?.status).toBe("broken");
    expect(result.errors).toHaveLength(1);
    const [error] = result.errors;
    expect(error.code).toBe("modern.invalid");
    expect(error.message).toBe("Choose a supported property for this Aura (Modern) condition.");
    expect(error.pointer).toMatchObject({ tab: "conditions", condition: 1, change: 1, property: "desaturate" });
    expect(error.pointer?.path).toEqual(["conditions", 1, "changes", 1, "property"]);
    expect(result.combat?.messages[0]).toMatch(/^Won't work: Choose a supported property/);
  });

  test("every bad change is reported, each with its own pointer", async () => {
    const aura = structuredClone(modernDesaturateBad);
    (aura.conditions as AuraDocument[]).push({
      check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: "60" },
      changes: [{ property: "alpha", value: 0.5 }],
    });
    const result = await core.validate(single(aura));
    expect(result.errors.map((e) => e.pointer?.label)).toEqual([
      "Condition 1, change 1 (desaturate)",
      "Condition 2, change 1 (alpha)",
    ]);
  });

  test("a classic aura trigger with exact spell IDs warns that combat hides those values", async () => {
    const result = await core.validate(single(aura2SpellIds));
    expect(result.errors).toEqual([]);
    expect(result.combat?.status).toBe("limited");
    const warning = result.warnings.find((w) => w.code === "combat.hiddenValues");
    expect(warning?.message).toMatch(/^In combat, the game hides some values of this trigger/);
    expect(warning?.pointer).toMatchObject({ tab: "trigger", trigger: 1 });
  });

  test("a pointer's tab is the options editor's tab key, so it opens that tab", async () => {
    const states = [modernDesaturateBad, aura2SpellIds, { ...modernGlowOk, regionType: "model" }].map(single);
    const tabs = new Set<string>();
    for (const state of states) {
      const result = await core.validate(state);
      for (const { pointer } of [...result.errors, ...result.warnings]) {
        if (!pointer) continue;
        tabs.add(pointer.tab);
        expect((await core.options(state, { tab: pointer.tab })).tab).toBe(pointer.tab);
      }
    }
    expect([...tabs].sort()).toEqual(["conditions", "region", "trigger"]);
  });

  test("validates every aura of a group and names the aura", async () => {
    const states = await tutorialStates();
    const group = states.find((s) => s.children.length > 0)!;
    const result = await core.validate(group);
    for (const m of [...result.errors, ...result.warnings]) expect(typeof m.auraId).toBe("string");
  });

  test("never throws on a broken document", async () => {
    const result = await core.validate(single({ id: "x", regionType: "icon", triggers: { nonsense: true } }));
    expect(result.combat?.status).toBeDefined();
  });
});

describe("Aura (Modern) Remaining Time (the trigger's own window, secretUseRem)", () => {
  const remTrigger = (aura: AuraDocument) => (aura.triggers as { trigger: AuraDocument }[])[0].trigger;
  const withTrigger = (aura: AuraDocument, extra: AuraDocument): AuraDocument => ({
    ...aura,
    triggers: [{ trigger: { ...remTrigger(aura), ...extra }, untrigger: {} }],
  });
  const messages = (r: { errors: { message: string }[]; warnings: { message: string }[] }) =>
    [...r.errors, ...r.warnings].map((m) => m.message);

  test("an Icon shown under 3 minutes gets its Blizzard aura slot and is fully usable in combat", async () => {
    const result = await core.validate(single(modernRemainingWindowOk));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.combat).toEqual({ status: "ok", messages: ["Fully usable in combat."] });
  });

  test("every comparison binds its slot", async () => {
    for (const op of ["<", "<=", ">", ">="]) {
      const result = await core.validate(single(withTrigger(modernRemainingWindowOk, { secretRemOperator: op, secretRem: "180" })));
      expect({ op, messages: messages(result) }).toEqual({ op, messages: [] });
    }
  });

  test("enabling it in the Trigger tab of the default icon keeps it fully usable", async () => {
    const sample = single(sampleIconAura(core.internalVersion));
    const edit = await core.setOption(sample, { tab: "trigger", path: ["trigger.1.secretAura.useRem"] }, true);
    const result = await core.validate(edit.state);
    expect(messages(result)).toEqual([]);
    expect(result.combat?.status).toBe("ok");
  });

  test("cases the addon doesn't support still fail with its own messages", async () => {
    const anchored = await core.validate(single({ ...modernRemainingWindowOk, regionType: "aurabar", anchorFrameType: "UNITFRAME" }));
    expect(anchored.combat?.status).toBe("broken");
    expect(messages(anchored)).toEqual(["Remaining Time can't anchor to unit frames or nameplates."]);

    const noWindow = await core.validate(single(withTrigger(modernRemainingWindowOk, { secretRem: -1 })));
    expect(noWindow.combat?.status).toBe("broken");
    expect(messages(noWindow)).toEqual(["Remaining Time: pick a comparison and a seconds value of 0 or more."]);
  });
});

describe("registries", () => {
  test("region and sub-region defaults, trigger prototypes and Aura (Modern) registries", async () => {
    const r = await core.registries();
    expect(r.internalVersion).toBe(core.internalVersion);
    const regionTypes = r.regionTypes as Record<string, { default: Record<string, unknown> }>;
    expect(regionTypes.icon.default.desaturate).toBe(false);
    expect(Object.keys(r.subRegionTypes as object)).toContain("subglow");
    expect(Object.keys(r.eventPrototypes as object)).toContain("Health");
    const secret = r.secretAura as Record<string, unknown>;
    expect(secret.supportsDurationColorCondition).toBe(true);
    expect(Object.keys(secret.VARIABLES as object)).toContain("faAuraRemaining");
    expect(await core.registries()).toBe(r);
  });
});

describe("addon contract", () => {
  test("a version without something the core relies on fails to load, naming it", async () => {
    const doctored = async (path: string) => {
      const text = await fetchSource(path);
      return path === "WeakAuras/BlizzardAuraDisplayValidation.lua"
        ? text.replace("Display.Validate = function", "Display.ValidateRenamed = function")
        : text;
    };
    const broken = await loadAddon(REF, { fetchSource: doctored });
    const err = await broken.loadFullAddon().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AddonContractError);
    expect((err as Error).message).toMatch(/Private\.BlizzardAuraDisplay\.Validate\b/);
    // the light path still works
    expect(broken.decode(broken.encode(single(modernGlowOk))).aura).toEqual(modernGlowOk);
  }, 120_000);
});
