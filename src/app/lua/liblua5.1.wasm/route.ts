import { readFile } from "node:fs/promises";
import { LUA_WASM_PATH } from "@/server/addon/core";

/** Serves wasmoon's Lua 5.1 WebAssembly binary from the installed package, so the browser needn't use a CDN. */
export async function GET() {
  const bytes = await readFile(LUA_WASM_PATH);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/wasm", "Cache-Control": "public, max-age=86400" },
  });
}
