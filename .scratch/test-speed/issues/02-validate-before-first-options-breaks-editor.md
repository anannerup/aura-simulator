# Validating a pack before the core's first options() call breaks loading it into the editor

Status: needs-triage

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

`O.installWindow` (`src/core/addon-vm/lua/dialogs.ts`) does install the window stand-in (the `frame` upvalue was nil when
`setup()` ran), so what WeakAurasOptions.lua:625 (`WeakAuras.IsOptionsOpen`) sees as `frame` must be set or replaced
after that. Not investigated further.

## Test

`wago-tbc` runs as one shard in `npm run test:all` (vitest.config.ts) so its order stays as it was; split it (4 shards
took it from about 180 s to about 70 s) once this is fixed.
