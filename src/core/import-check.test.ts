/**
 * Story 7: importing an aura behaves as the game's import does. The addon's own WeakAuras.Import and import dialog
 * decide (`importCheck`), for both games: an aura (or any child) with an internalVersion above the addon's is refused
 * with the dialog's message; anything else is offered for import.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { loadAddon, type AuraCore, type AuraDocument } from "@/core";
import { cachedAddonFetcher } from "../../tests/support/addon-source";
import { TBC_TEST_VERSION, weakAuras2Available, weakAuras2Fetcher } from "../../tests/support/weakauras2";

const NEWER = /created with a newer version of WeakAuras/;

const cores: Partial<Record<"forever" | "tbc", AuraCore>> = {};

beforeAll(async () => {
  cores.forever = await loadAddon("v1.15.0", { fetchSource: cachedAddonFetcher("v1.15.0"), fullAddon: "inline" });
  if (await weakAuras2Available()) {
    cores.tbc = await loadAddon(TBC_TEST_VERSION, { fetchSource: weakAuras2Fetcher(), game: "tbc", fullAddon: "inline" });
  }
}, 180_000);
afterAll(() => Object.values(cores).forEach((c) => c?.dispose()));

for (const game of ["forever", "tbc"] as const) {
  describe(`${game}: the addon's import decides`, () => {
    const core = (ctx: { skip: () => void }) => {
      if (!cores[game]) ctx.skip();
      return cores[game]!;
    };

    test("an aura of this addon version is offered for import", async (ctx) => {
      const c = core(ctx);
      const aura = { ...(await c.newAura("icon")), id: "Mine" };
      expect(await c.importCheck({ aura, children: [] })).toEqual({ importable: true });
      // An agent's document without internalVersion is taken as written for this version.
      const plain: AuraDocument = { ...aura };
      delete plain.internalVersion;
      expect(await c.importCheck({ aura: plain, children: [] })).toEqual({ importable: true });
    });

    test("an aura made with a newer version is refused with the import dialog's message", async (ctx) => {
      const c = core(ctx);
      const aura = { ...(await c.newAura("icon")), id: "Newer", internalVersion: c.internalVersion + 1 };
      const check = await c.importCheck({ aura, children: [] });
      expect(check).toEqual({ importable: false, message: expect.stringMatching(NEWER) });
    });

    test("a group is refused when any child is newer", async (ctx) => {
      const c = core(ctx);
      const group = { ...(await c.newAura("group")), id: "G", controlledChildren: ["A"] };
      const child = { ...(await c.newAura("icon")), id: "A", parent: "G", internalVersion: c.internalVersion + 5 };
      expect((await c.importCheck({ aura: group, children: [child] })).importable).toBe(false);
      expect((await c.importCheck({ aura: group, children: [{ ...child, internalVersion: c.internalVersion }] })).importable).toBe(true);
    });
  });
}

test("a Musca Auras code (internalVersion 92) is refused by WeakAuras2 5.22.1 (90), as on TBC Anniversary", async (ctx) => {
  if (!cores.tbc) ctx.skip();
  const musca = cores.forever!;
  const decoded = cores.tbc!.decode(musca.encode({ aura: { ...(await musca.newAura("icon")), id: "From Forever" }, children: [] }));
  expect(decoded.aura.internalVersion).toBe(musca.internalVersion);
  expect((await cores.tbc!.importCheck(decoded)).importable).toBe(false);
});
