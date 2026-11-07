# 07: TBC rules, situation and validation; renderer sharing by hash

**What to build:**
- **Rules:** TBC's condition and trigger evaluation is plain WeakAuras (no secret auras, no freezing); TBC's situation controls show its trigger kinds.
- **Validation:** on `/tbc` it shows the addon's own warnings without the combat check.
- **Mirrored files:** each game records the addon files its rules and renderers mirror (hashes at the default version). A renderer is shared only while the Lua file it ports is byte-identical in both addons; where it differs, split it per game.

**Blocked by:** 04

**Status:** done

- [x] `/tbc` previews icon, bar, text, texture and progress texture auras with aura2 triggers in and out of combat
- [x] No combat check on `/tbc`; Forever unchanged
- [x] Mirror test per game fails when a mirrored file changes; shared renderers are listed with both games' hashes

**Core half done** (rules, situation, validation, mirrored files, render plumbing): `auraRules(game)`,
`evaluateTbcAura`, `ValidationResult.combat` only for Forever, `src/core/mirrored.ts` (`MIRRORED`, `SHARED_PORTS`),
`layoutScreen(…, game)` / `GameScreenAuras game`. Left for the UI wiring on `/tbc`: pass the game to
`GameScreenAuras` and use `auraRules(game)` in the situation controls (trigger kinds, `setInCombat`); the validation
panel already hides the combat block when there is no verdict, but its "Checking with Musca Auras' own rules…" text is
Forever's.

## Done (UI wiring)

- `SituationControls`, `useConditionProblems` (no Aura (Modern) on TBC, so nothing to validate) and the New Aura
  thumbnails take `auraRules(game)`; "In combat" stays on TBC as a world fact.
- The validation panel is "Addon check" on TBC, in the addon's name ("WeakAuras finds no problems…"), without a combat
  verdict; Forever keeps "Combat check". e2e: `tests/e2e/tbc.spec.ts` (five display types on aura2 in and out of combat;
  no combat check).
