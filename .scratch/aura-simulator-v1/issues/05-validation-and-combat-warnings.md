# 05: Defaults, validation and combat warnings

**What to build:** Defaults and the addon's own validation run from its Lua, including the 'Aura (Modern)' (secretAura) combat rules. Plain-language warnings appear in the page and in push responses; export is never blocked.

**Blocked by:** 03

**Status:** done except the push-response merge (one line, see below)

- [x] Defaults filled from the addon's default tables; internalVersion matches the addon
- [x] Validation errors and combat warnings in plain words, pointing at the option
- [ ] Push response includes machine-readable warnings (helper ready: `validateCode(code)` in `src/server/validation.ts`; add `validation: await validateCode(code)` to `pushToWorkspace`'s answer in `src/server/workspaces/index.ts` and document it in `src/docs/agent-docs.ts`)
- [x] Fixtures: known-good and known-bad auras (e.g. remaining-time condition driving desaturate is flagged)

## Notes (implementation)

- Full addon VM: `src/core/addon-vm/` (shim, bridge, extract Lua as string modules; `profile.ts` is the
  Forever client profile; `contract.ts` the addon contract checked at load). Core API: `fillDefaults`,
  `validate`, `registries`, `loadFullAddon` on `AuraCore`; loads lazily (Web Worker in the browser).
- Profile answers not yet checked in the game are listed in `FOREVER_CLIENT_PROFILE` (`verified: false`): for ticket 17.
