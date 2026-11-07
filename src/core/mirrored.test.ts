/**
 * The addon files each game's rules and renderers restate are pinned (`mirrored.ts`); this fails when one changes,
 * when a game's default version moves, or when a file's sameness between Musca Auras and WeakAuras2 changes (a shared
 * module must then be re-checked). TBC's files come from the WeakAuras2 release zip; offline (no cached zip) those
 * cases skip.
 */
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { cachedAddonFetcher } from "../../tests/support/addon-source";
import { TBC_TEST_VERSION, weakAuras2Available, weakAuras2Fetcher } from "../../tests/support/weakauras2";
import { forever } from "@/games/forever";
import type { AddonSourceFetcher } from "./addon-source";
import { MIRRORED, SHARED_PORTS } from "./mirrored";

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
/** The text both addons are compared by: WeakAuras2's release zip has CRLF line endings, Musca's repository LF. */
const normalized = (text: string) => text.replaceAll("\r\n", "\n");

async function hashes(fetch: AddonSourceFetcher, paths: string[]): Promise<Record<string, string>> {
  const actual: Record<string, string> = {};
  for (const path of paths) actual[path] = hash(await fetch(path));
  return actual;
}

const tbcFetcher = async (ctx: { skip: () => void }): Promise<AddonSourceFetcher> => {
  if (!(await weakAuras2Available(MIRRORED.tbc.ref))) ctx.skip();
  return weakAuras2Fetcher(MIRRORED.tbc.ref);
};

describe("Forever (Musca Auras)", () => {
  test("the restated files follow the default addon version", () => {
    expect(MIRRORED.forever.ref).toBe(forever.addon.fallbackRef);
  });

  test("the files the rules and renderers restate are unchanged at the pinned version", async () => {
    const files = MIRRORED.forever.files;
    expect(await hashes(cachedAddonFetcher(MIRRORED.forever.ref), Object.keys(files))).toEqual(files);
  });
});

describe("TBC (WeakAuras2)", () => {
  test("the restated files follow the version the TBC tests load", () => {
    expect(MIRRORED.tbc.ref).toBe(TBC_TEST_VERSION);
  });

  test("the files the rules and renderers restate are unchanged at the pinned version", async (ctx) => {
    const files = MIRRORED.tbc.files;
    expect(await hashes(await tbcFetcher(ctx), Object.keys(files))).toEqual(files);
  }, 60_000);
});

describe("modules both games share", () => {
  test("pin what they port in both games; Musca-only files in Forever only", () => {
    for (const port of SHARED_PORTS) {
      for (const file of port.files) {
        expect(MIRRORED.forever.files, `${port.module}: ${file}`).toHaveProperty([file]);
        expect(MIRRORED.tbc.files, `${port.module}: ${file}`).toHaveProperty([file]);
      }
      for (const file of port.foreverOnly ?? []) {
        expect(MIRRORED.forever.files, `${port.module}: ${file}`).toHaveProperty([file]);
        expect(MIRRORED.tbc.files, `${port.module}: ${file}`).not.toHaveProperty([file]);
      }
      for (const file of Object.keys(port.differs)) expect(port.files, port.module).toContain(file);
    }
  });

  test("explain exactly the ported files that differ between the addons", async (ctx) => {
    const forever = cachedAddonFetcher(MIRRORED.forever.ref);
    const tbc = await tbcFetcher(ctx);
    const differs = new Set<string>();
    for (const file of new Set(SHARED_PORTS.flatMap((p) => p.files))) {
      if (normalized(await forever(file)) !== normalized(await tbc(file))) differs.add(file);
    }
    for (const port of SHARED_PORTS) {
      const actual = port.files.filter((f) => differs.has(f)).sort();
      expect(Object.keys(port.differs).sort(), port.module).toEqual(actual);
    }
  }, 60_000);
});
