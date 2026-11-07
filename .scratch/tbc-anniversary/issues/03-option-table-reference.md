# 03: Option ↔ table reference generated from the addon

**What to build:** in the addon VM, generate a reference for an addon version.

For each tab key and display type, every option gets an entry:
- option path and name;
- the exact document (JSON) paths its `set()` writes, found by probe edits as in the tab sweep;
- type and control;
- allowed values;
- the default (from the addon's NewAura defaults);
- the description text.

Triggers are covered per trigger type and event subtype, and so are sub-elements and conditions.

Also build the reverse index (JSON path → options), and expose both from the aura core.

**Blocked by:** None (can start immediately). Docs integration happens in 05.

**Status:** ready-for-agent

- [ ] Core API returns the reference and reverse index for the loaded version
- [ ] Test: every option of every tab for every display type has an entry, and its paths equal exactly what its `set()` changes
- [ ] Generation time is acceptable for serving (cache per version on the server)
