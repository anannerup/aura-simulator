import { keepOptionReferences } from "../support/e2e-server";

/** After the tests: option references the server generated go into the generated cache (tests/support/e2e-server.ts). */
export default async function globalTeardown() {
  await keepOptionReferences(Number(process.env.E2E_PORT ?? 3100));
}
