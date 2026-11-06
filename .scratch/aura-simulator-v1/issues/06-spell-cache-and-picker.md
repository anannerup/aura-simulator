# 06: Spell cache and spell picker

**What to build:** SQLite spell cache on the server. Sync pulls Forever's spell list (wago.tools build product wowf) and icons/tooltips (Wowhead). Name search via API and a picker; real icons in the preview; unknown spells flagged.

**Blocked by:** 01 (server part can start immediately)

**Status:** ready-for-agent (server part done; picker UI and preview icons remain, waiting on 01)

- [x] Sync loads SpellName (+ icon mapping) for the current wowf build into SQLite
- [x] Search by name and lookup by ID via API
- [x] Icons/tooltips filled from Wowhead and cached
- [ ] Picker in the page; preview uses real icons
- [ ] Unknown or unclear spells flagged; manual ID entry possible
- [x] Tests use recorded wago/Wowhead fixtures, no network

## Server part (done)

Module `src/server/spells/` (`getSpellCache()` → `sync`, `search`, `lookup`, `status`), routes:

- `GET /api/spells/search?q=<name or ID>&limit=<1-100, default 20>` → `{query, build, results: [{id, name, icon, iconUrl}]}`.
  Case-insensitive, every word must occur; exact name, then prefix, then word-prefix, then substring;
  a numeric query also matches the ID. No network.
- `GET /api/spells/<id>` → `Spell` (`found`, `name`, `icon`, `iconUrl`, `tooltip`, `buff`, `source`, `forever`, `wowhead`, `flags`);
  404 with the same body when no source knows the ID, 400 for a non-numeric ID. Fetches Wowhead once per ID and caches it.
- `POST /api/spells/sync` (optional body `{"build": "..."}`) → `{product, build, syncedAt, spellCount, spellsWithIcon, durationMs}`; 502 on failure (old data kept).
- `GET /api/spells/status` → `{synced, product, build, syncedAt, spellCount, spellsWithIcon, wowhead: {found, notFound}}`.

Flags: `not-synced`, `not-in-forever`, `not-on-wowhead`, `wowhead-unavailable`, `name-mismatch`, `icon-mismatch`, `no-icon`, `unknown`.

Data: names/IDs from wago `SpellName`; icons from wago `SpellMisc.SpellIconFileDataID` → `ManifestInterfaceData`
(Interface\ICONS file names, lower-cased, matching Wowhead's icon names); tooltips lazily from Wowhead's Classic tooltip API.
Icon images: `https://wow.zamimg.com/images/wow/icons/<small|medium|large>/<icon>.jpg` (`iconUrl()` helper).

## Remaining (needs ticket 01's page)

- Picker UI: search box calling `/api/spells/search`, list with icons, manual ID entry via `/api/spells/<id>`.
- Show `flags` in the picker/editor so the player double-checks flagged spells.
- Preview uses the spell's `iconUrl` (falls back to a question-mark icon when `icon` is null).
- A sync button (or a first-run prompt when `/api/spells/status` says `synced: false`).
