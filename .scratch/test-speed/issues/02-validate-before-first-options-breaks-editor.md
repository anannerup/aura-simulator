# Validating a pack before the core's first options() call breaks loading it into the editor

Status: resolved

Found while splitting `src/core/wago-tbc.test.ts` into shards.

## What happens

On a fresh TBC aura core (WeakAuras2 5.22.1), validate the recorded pack "Tems' TBC Dungeons WA Pack" (wago
`PA-hKPPtc`), then open it in the editor:

```ts
const c = await loadAddon(TBC_TEST_VERSION, { fetchSource: weakAuras2Fetcher(), game: "tbc" });
const state = c.decode(readFileSync("tests/fixtures/wago/tbc/PA-hKPPtc.txt", "utf8").trim());
await c.validate(state);
const r = await c.options(state, { selected: String(state.aura.id) });
// r.warning: "…: WeakAurasOptions/WeakAurasOptions.lua:625: attempt to call method 'IsVisible' (a nil value)" for
// every aura of the pack, and its "every tab builds" check fails ("The addon did not register Ramparts - …").
```

Without the `validate` first, or after any other aura has been opened in the editor on that core, it loads fine. Once
it has failed, other packs on the same core fail the same way (Paladin, Maey's Auto Marker, Cube Assigner, …).

The whole `wago-tbc.test.ts` passes only because its first aura opens the editor before any of these packs is
validated: run it alone with `-t "Dungeons WA Pack"` (on main too) and it fails. The page validates pushed auras, so a
fresh page (or the server's core) can probably hit this too.

## Cause

Not the options window: wasmoon's `doStringSync` leaves the chunk's results on the VM's global Lua stack, so every call
into a VM grew it by one (validating a pack is one call per aura: the stack was at 358 after this one). wasmoon's own
pushes don't check for room (`lua_checkstack`), so once the stack filled its allocation they wrote past its end and
corrupted the Lua heap: which call broke depended on the heap layout (validating 50 auras broke it, 100 didn't, 155
did), and a call in between could hide it. Both VMs (the light one and the full addon VM) leaked this way, so long
sessions in the page and the server could hit it too.

## Fix

`runLua` (`src/core/lua-run.ts`) runs every chunk and puts the stack top back; `aura-core.ts` and `addon-vm/vm.ts`
call Lua only through it. Regression test: `src/core/lua-stack.test.ts` (fails without the fix). `wago-tbc` runs in 4
shards again.
