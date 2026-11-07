import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { cachedAddonFetcher } from "../../../tests/support/addon-source";
import { DEFAULT_ADDON_REF } from "../addon-source";
import { MIRRORED } from "./mirrored";

test("the restated rules follow the default addon version", () => {
  expect(MIRRORED.ref).toBe(DEFAULT_ADDON_REF);
});

test("the addon files the rules restate are unchanged at the pinned version", async () => {
  const fetch = cachedAddonFetcher(MIRRORED.ref);
  const actual: Record<string, string> = {};
  for (const path of Object.keys(MIRRORED.files)) {
    actual[path] = createHash("sha256").update(await fetch(path)).digest("hex").slice(0, 16);
  }
  expect(actual).toEqual(MIRRORED.files);
});
