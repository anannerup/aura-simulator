import { describe, expect, it, vi } from "vitest";
import { sampleIconAura, setTriggerSpellId, triggerSpellId, type AuraDocument } from "@/core";
import {
  createIconStore,
  displayIconRef,
  iconCandidates,
  resolveAuraIcon,
  type IconLookup,
} from "@/render/textures";

const sample = () => sampleIconAura(80);

/** Lookup over fixed tables; IDs missing from both count as not loaded yet. */
function lookupFrom(files: Record<number, string | null>, spells: Record<number, string | null>): IconLookup {
  return (ref) => {
    if (ref.kind === "name") return ref.name;
    const table = ref.kind === "file" ? files : spells;
    return ref.id in table ? table[ref.id] : undefined;
  };
}

describe("displayIconRef", () => {
  it("reads FileDataIDs and Interface\\Icons paths", () => {
    expect(displayIconRef(135932)).toEqual({ kind: "file", id: 135932 });
    expect(displayIconRef("135932")).toEqual({ kind: "file", id: 135932 });
    expect(displayIconRef("Interface\\Icons\\Spell_Holy_MagicalSentry")).toEqual({
      kind: "name",
      name: "spell_holy_magicalsentry",
    });
    expect(displayIconRef("Interface/ICONS/INV_Misc_QuestionMark.blp")).toEqual({
      kind: "name",
      name: "inv_misc_questionmark",
    });
    expect(displayIconRef("Interface\\AddOns\\WeakAuras\\Media\\Textures\\foo")).toBeNull();
    expect(displayIconRef(undefined)).toBeNull();
    expect(displayIconRef(0)).toBeNull();
    expect(displayIconRef("")).toBeNull();
  });
});

describe("iconCandidates", () => {
  it("automatic icon (-1): the first trigger's spell, then displayIcon", () => {
    expect(iconCandidates(sample())).toEqual([
      { kind: "spell", id: 1459 },
      { kind: "file", id: 135932 },
    ]);
  });

  it("manual icon (0): only displayIcon", () => {
    expect(iconCandidates({ ...sample(), iconSource: 0 })).toEqual([{ kind: "file", id: 135932 }]);
  });

  it("trigger N: that trigger's spell, then displayIcon", () => {
    const two = setTriggerSpellId(sample(), 2, 116);
    expect(iconCandidates({ ...two, iconSource: 2 })).toEqual([
      { kind: "spell", id: 116 },
      { kind: "file", id: 135932 },
    ]);
    expect(iconCandidates({ ...two, iconSource: 3 })).toEqual([{ kind: "file", id: 135932 }]);
  });

  it("defaults iconSource to automatic and skips triggers without spell IDs", () => {
    const noSource = sample();
    delete noSource.iconSource;
    expect(iconCandidates(noSource)[0]).toEqual({ kind: "spell", id: 1459 });
    const nameOnly: AuraDocument = {
      regionType: "icon",
      triggers: [{ trigger: { type: "aura2", useName: true, auranames: ["Arcane Intellect"] }, untrigger: {} }],
    };
    expect(iconCandidates(nameOnly)).toEqual([]);
  });
});

describe("resolveAuraIcon", () => {
  it("uses the spell's icon for an automatic icon", () => {
    const lookup = lookupFrom({ 135932: "spell_holy_magicalsentry" }, { 1459: "spell_holy_arcaneintellect" });
    expect(resolveAuraIcon(sample(), lookup)).toEqual({ icon: "spell_holy_arcaneintellect", pending: false });
  });

  it("falls back to displayIcon when the spell has no icon, then to the question mark", () => {
    expect(resolveAuraIcon(sample(), lookupFrom({ 135932: "spell_holy_magicalsentry" }, { 1459: null }))).toEqual({
      icon: "spell_holy_magicalsentry",
      pending: false,
    });
    expect(resolveAuraIcon(sample(), lookupFrom({ 135932: null }, { 1459: null }))).toEqual({
      icon: "inv_misc_questionmark",
      pending: false,
    });
    expect(resolveAuraIcon({ regionType: "icon" }, lookupFrom({}, {}))).toEqual({
      icon: "inv_misc_questionmark",
      pending: false,
    });
  });

  it("is pending while a candidate ahead of the answer is loading", () => {
    expect(resolveAuraIcon(sample(), lookupFrom({ 135932: "x" }, {}))).toEqual({ icon: null, pending: true });
    // A manual icon doesn't wait for the trigger's spell.
    expect(resolveAuraIcon({ ...sample(), iconSource: 0 }, lookupFrom({ 135932: "x" }, {}))).toEqual({
      icon: "x",
      pending: false,
    });
  });
});

describe("createIconStore", () => {
  it("batches lookups into one request, caches answers and notifies", async () => {
    const fetchIcons = vi.fn(async ({ files, spells }: { files: number[]; spells: number[] }) => ({
      files: Object.fromEntries(files.map((id) => [id, id === 135932 ? "spell_holy_magicalsentry" : null])),
      spells: Object.fromEntries(spells.map((id) => [id, id === 1459 ? "spell_holy_magicalsentry" : null])),
    }));
    const store = createIconStore(fetchIcons);
    const listener = vi.fn();
    store.subscribe(listener);

    store.request(iconCandidates(sample()));
    store.request([{ kind: "spell", id: 1459 }, { kind: "file", id: 1 }]);
    expect(store.lookup({ kind: "spell", id: 1459 })).toBeUndefined();
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    expect(fetchIcons).toHaveBeenCalledTimes(1);
    expect(fetchIcons).toHaveBeenCalledWith({ files: [135932, 1], spells: [1459] });
    expect(store.lookup({ kind: "spell", id: 1459 })).toBe("spell_holy_magicalsentry");
    expect(store.lookup({ kind: "file", id: 1 })).toBeNull();
    expect(resolveAuraIcon(sample(), store.lookup).icon).toBe("spell_holy_magicalsentry");

    store.request(iconCandidates(sample()));
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchIcons).toHaveBeenCalledTimes(1);
  });

  it("treats a failed request as unknown, and primed icons need no request", async () => {
    const store = createIconStore(async () => {
      throw new Error("offline");
    });
    store.request([{ kind: "spell", id: 1459 }]);
    await vi.waitFor(() => expect(store.lookup({ kind: "spell", id: 1459 })).toBeNull());

    store.prime({ kind: "spell", id: 116 }, "spell_frost_frostbolt02");
    expect(resolveAuraIcon(setTriggerSpellId(sample(), 1, 116), store.lookup).icon).toBe("spell_frost_frostbolt02");
  });
});

describe("trigger spell IDs", () => {
  it("reads and sets secretAura spell IDs", () => {
    const aura = setTriggerSpellId(sample(), 1, 116);
    expect(triggerSpellId(aura, 1)).toBe(116);
    expect(aura.triggers).toMatchObject({
      "[1]": { trigger: { type: "secretAura", auraspellids: ["116"], secretUseSpellIDs: true, unit: "player" } },
      activeTriggerMode: -10,
    });
    expect(triggerSpellId(sample(), 1)).toBe(1459);
  });

  it("uses each trigger system's own fields", () => {
    const base: AuraDocument = {
      triggers: [
        { trigger: { type: "aura2", useName: true, auranames: ["X"] }, untrigger: {} },
        { trigger: { type: "spell", event: "Cooldown Progress (Spell)" }, untrigger: {} },
      ],
    };
    const aura = setTriggerSpellId(setTriggerSpellId(base, 1, 1459), 2, 133);
    expect(aura.triggers).toMatchObject({
      "[1]": { trigger: { type: "aura2", auraspellids: ["1459"], useExactSpellId: true, useName: false } },
      "[2]": { trigger: { type: "spell", spellName: 133, use_spellName: true, use_exact_spellName: true } },
    });
    expect([triggerSpellId(aura, 1), triggerSpellId(aura, 2)]).toEqual([1459, 133]);
  });

  it("creates a trigger when the aura has none", () => {
    const aura = setTriggerSpellId({ regionType: "icon" }, 1, 1459);
    expect(triggerSpellId(aura, 1)).toBe(1459);
    expect(() => setTriggerSpellId(aura, 1, 0)).toThrow(RangeError);
  });
});
