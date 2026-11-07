import { seedOptionReferences } from "../support/e2e-server";
import { e2eSpellDbPath, seedE2eSpellDb } from "../support/e2e-spell-db";
import { weakAuras2Available } from "../support/weakauras2";

/**
 * Before any test runs (the server is already up): seeds the server's spell databases (Forever and TBC) from fixtures,
 * makes sure the WeakAuras2 release zip TBC loads is unpacked in `.cache/weakauras2` (downloaded once, checked against
 * the recorded sha256; the server reads it there through ADDON_CACHE_DIR_TBC), so the server needs no network, and
 * gives the server the option references cached for the generator's current code (tests/support/e2e-server.ts).
 */
export default async function globalSetup() {
  const port = Number(process.env.E2E_PORT ?? 3100);
  await seedE2eSpellDb(e2eSpellDbPath(port, "forever"), "forever");
  await seedE2eSpellDb(e2eSpellDbPath(port, "tbc"), "tbc");
  if (!(await weakAuras2Available())) throw new Error("The /tbc tests need WeakAuras2's release zip in .cache/weakauras2 (one download)");
  await seedOptionReferences(port);
}
