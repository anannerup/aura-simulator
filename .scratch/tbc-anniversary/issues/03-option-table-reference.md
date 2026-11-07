# 03: Option ↔ table reference in the agent docs

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

Serve it in the agent docs: a Markdown section (both directions) and `options.json` next to the docs, cached per version on the server.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Core API returns the reference and reverse index for the loaded version
- [ ] Test: every option of every tab for every display type has an entry, and its paths equal exactly what its `set()` changes
- [ ] Docs page and `options.json` show the reference for the requested version; e2e checks a known option ↔ path pair
- [ ] Generation time is acceptable for serving (cache per version on the server)
