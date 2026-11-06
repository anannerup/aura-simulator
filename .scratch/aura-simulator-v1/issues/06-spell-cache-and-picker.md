# 06: Spell cache and spell picker

**What to build:** SQLite spell cache on the server. Sync pulls Forever's spell list (wago.tools build product wowf) and icons/tooltips (Wowhead). Name search via API and a picker; real icons in the preview; unknown spells flagged.

**Blocked by:** 01 (server part can start immediately)

**Status:** ready-for-agent

- [ ] Sync loads SpellName (+ icon mapping) for the current wowf build into SQLite
- [ ] Search by name and lookup by ID via API
- [ ] Icons/tooltips filled from Wowhead and cached
- [ ] Picker in the page; preview uses real icons
- [ ] Unknown or unclear spells flagged; manual ID entry possible
- [ ] Tests use recorded wago/Wowhead fixtures, no network
