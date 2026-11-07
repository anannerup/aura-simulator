# 06: TBC client data and spell database

**What to build:**
- **Spell database:** TBC gets its own, synced from wago `wow_anniversary` (SpellName, SpellMisc, ManifestInterfaceData), with Wowhead TBC tooltips (`nether.wowhead.com/tbc/...`, `dataEnv=5`). The spell picker on `/tbc` uses it, and the "Not in Forever" wording becomes per game.
- **Client data:** generated from `wow_anniversary` (classes, talents, difficulties, item types) for the Load tab.
- **Profile:** the TBC profile answers C_Spell from the TBC database.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Recorded `wow_anniversary` fixtures; the spell picker on `/tbc` finds TBC spells with TBC tooltips
- [ ] Load tab lists TBC classes, talents and difficulties
