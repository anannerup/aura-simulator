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

## Completion pass (2026-11-07)

- Tab sweeps: `src/core/options-sweep.test.ts` sets every editable option and runs every button of every tab for
  all ten display types, every trigger type/event and after every Add button; `tests/e2e/tab-sweep.spec.ts` does
  the same through the form. `tests/e2e/options-widgets.spec.ts` checks the widgets below.
- Dialog buttons (icon/texture/model picker, code editor, confirmations) report `edit.dialog`; the window shows a web
  dialog and answers with the same button. Colour swatch + picker; media dropdowns with previews.
- Group tabs return changed children (`edit.children`). New Aura page and Packs read from the addon.
- Client profile: Forever DB2 data (`client-data.json`) for Load lists; no retail spec/trait APIs; PowerBarColor;
  Cooldown Manager viewers.
- Not done: thumbnails the addon draws with frames (group, dynamic group, Modern Aura Group) are CSS look-alikes;
  other types are drawn by the simulator's renderer from the new aura. Premade Auras needs WeakAurasTemplates
  (not loaded). The talent order (tier, then column) and the profile entries are unverified in game (ticket 17).
