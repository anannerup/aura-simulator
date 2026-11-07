# 07: TBC rules, situation and validation; renderer sharing by hash

**What to build:**
- **Rules:** TBC's condition and trigger evaluation is plain WeakAuras (no secret auras, no freezing); TBC's situation controls show its trigger kinds.
- **Validation:** on `/tbc` it shows the addon's own warnings without the combat check.
- **Mirrored files:** each game records the addon files its rules and renderers mirror (hashes at the default version). A renderer is shared only while the Lua file it ports is byte-identical in both addons; where it differs, split it per game.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `/tbc` previews icon, bar, text, texture and progress texture auras with aura2 triggers in and out of combat
- [ ] No combat check on `/tbc`; Forever unchanged
- [x] Mirror test per game fails when a mirrored file changes; shared renderers are listed with both games' hashes

**Core half done** (rules, situation, validation, mirrored files, render plumbing): `auraRules(game)`,
`evaluateTbcAura`, `ValidationResult.combat` only for Forever, `src/core/mirrored.ts` (`MIRRORED`, `SHARED_PORTS`),
`layoutScreen(…, game)` / `GameScreenAuras game`. Left for the UI wiring on `/tbc`: pass the game to
`GameScreenAuras` and use `auraRules(game)` in the situation controls (trigger kinds, `setInCombat`); the validation
panel already hides the combat block when there is no verdict, but its "Checking with Musca Auras' own rules…" text is
Forever's.
