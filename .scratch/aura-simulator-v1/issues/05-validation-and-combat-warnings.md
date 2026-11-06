# 05: Defaults, validation and combat warnings

**What to build:** Defaults and the addon's own validation run from its Lua, including the 'Aura (Modern)' (secretAura) combat rules. Plain-language warnings appear in the page and in push responses; export is never blocked.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Defaults filled from the addon's default tables; internalVersion matches the addon
- [ ] Validation errors and combat warnings in plain words, pointing at the option
- [ ] Push response includes machine-readable warnings
- [ ] Fixtures: known-good and known-bad auras (e.g. remaining-time condition driving desaturate is flagged)
