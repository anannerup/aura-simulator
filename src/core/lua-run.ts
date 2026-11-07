import type { Lua } from "wasmoon-lua5.1";

/**
 * Runs a Lua chunk and returns its first result, leaving the VM's stack as it found it. Every call into a VM goes
 * through here: wasmoon's doStringSync leaves the chunk's results on the global stack, so the stack grew by one per
 * call, and once it had filled its allocation wasmoon's own pushes (which don't check for room) wrote past its end and
 * corrupted the VM (e.g. validating a 155-aura pack and then loading it into the editor failed: lua-stack.test.ts).
 * The result is converted to a JavaScript value before the stack is put back.
 */
export function runLua(lua: Lua, chunk: string): unknown {
  const top = lua.global.getTop();
  try {
    return lua.doStringSync(chunk);
  } finally {
    lua.global.setTop(top);
  }
}
