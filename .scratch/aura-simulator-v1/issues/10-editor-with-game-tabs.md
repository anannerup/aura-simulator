# 10: Editor with the game's tabs

**What to build:** Display, Trigger, Conditions, Actions, Animations and Load tabs, mirroring in-game names, with fields generated from the addon's own option definitions so new addon options appear automatically.

**Blocked by:** 05, 09

**Status:** done

- [x] Tabs and labels mirror the in-game options window
- [x] Fields generated from the addon's option tables, not hand-listed
- [x] Edits sync with raw view and pushes
- [x] Switching addon version updates the forms

## Notes (done)

- Core: `AuraCore.options(state, { tab })` and `AuraCore.setOption(state, { tab, path }, value)` (worker-backed,
  `src/core/addon-vm/options.ts` + `lua/options.ts`). Tabs and generators are read from the options window's own
  source (`OptionsFrames/OptionsFrame.lua`); option trees come from `OptionsPrivate.Get*Options(data)`, evaluated like
  AceConfigDialog; edits run the option's own `set()`/`func()` and return the document as given plus the diff.
- Collapsible sections use the addon's own collapse state (sections start the way the game starts them).
- A headless stand-in for the options window (WeakAurasOptions.lua's local `frame`) makes the window refreshes that
  set()/func() code calls no-ops and caches `EnsureOptions` (group options merge their children's tables).
- UI: `src/components/options-editor/` (`OptionsEditor`, field widgets in `fields.tsx`), mounted in `Workbench`.
