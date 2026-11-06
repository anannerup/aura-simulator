import { e2eSpellDbPath, seedE2eSpellDb } from "../support/e2e-spell-db";

/** Seeds the dev server's spell database from fixtures before any test runs. */
export default async function globalSetup() {
  await seedE2eSpellDb(e2eSpellDbPath(Number(process.env.E2E_PORT ?? 3100)));
}
