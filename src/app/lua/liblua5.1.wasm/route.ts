import { readFile } from "node:fs/promises";
import path from "node:path";

/** Serves wasmoon's Lua 5.1 WebAssembly binary from the installed package, so the browser needn't use a CDN. */
export async function GET() {
  const file = path.join(process.cwd(), "node_modules/wasmoon-lua5.1/dist/liblua5.1.wasm");
  const bytes = await readFile(file);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/wasm", "Cache-Control": "public, max-age=86400" },
  });
}
