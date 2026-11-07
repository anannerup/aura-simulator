# 06: TBC client data and spell database

**What to build:**
- **Spell database:** TBC gets its own, synced from wago `wow_anniversary` (SpellName, SpellMisc, ManifestInterfaceData), with Wowhead TBC tooltips (`nether.wowhead.com/tbc/...`, `dataEnv=5`). The spell picker on `/tbc` uses it, and the "Not in Forever" wording becomes per game.
- **Client data:** generated from `wow_anniversary` (classes, talents, difficulties, item types) for the Load tab.
- **Profile:** the TBC profile answers C_Spell from the TBC database.

**Blocked by:** 04

**Status:** done

- [x] Recorded `wow_anniversary` fixtures; the spell picker on `/tbc` finds TBC spells with TBC tooltips
- [x] Load tab lists TBC classes, talents and difficulties

## Done

- `/api/tbc/spells`, icons and addon-spells use `tbcServer.spells` (`wow_anniversary`); the TBC client's C_Spell answers
  from it (`tests/unit/agent-docs-tbc.test.ts`: rank 6 Arcane Intellect, 27126, shows its name in the options).
- The spell picker's words are per game (`SpellApi.game`: "Not in TBC", Wowhead TBC). e2e seeds TBC's spell database
  from `tests/fixtures/tbc/spells`; `tests/e2e/tbc.spec.ts` finds Lifebloom with its TBC tooltip.
- Load tab data: `src/core/weakauras2-tbc.test.ts` (races, difficulties, item types, talents).
