# 06: Spell cache and spell picker

**What to build:** SQLite spell cache on the server. Sync pulls Forever's spell list (wago.tools build product wowf) and icons/tooltips (Wowhead). Name search via API and a picker; real icons in the preview; unknown spells flagged.

**Blocked by:** 01 (server part can start immediately)

**Status:** done

- [x] Sync loads SpellName (+ icon mapping) for the current wowf build into SQLite
- [x] Search by name and lookup by ID via API
- [x] Icons/tooltips filled from Wowhead and cached
- [x] Picker in the page; preview uses real icons
- [x] Unknown or unclear spells flagged; manual ID entry possible
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

## Picker and preview icons (done)

- Sync stores the Interface\ICONS mapping in table `icons(file_id, name)`. `SpellCache.icons({files, spells})` maps
  FileDataIDs and spell IDs to icon names (spells: Forever's icon, else a cached Wowhead icon; no network).
  Routes: `GET /api/icons/<fileDataId>` → `{fileDataId, icon, iconUrl}` (404 same body, 400 bad ID);
  `GET /api/icons?files=1,2&spells=3,4` (≤200 each) → `{files: {id: name|null}, spells: {id: name|null}}`.
- `src/render/textures.ts`: icon resolution as in RegionTypes/Icon.lua (`iconSource` -1 = first trigger with a spell ID,
  0 = `displayIcon`, N = trigger N; then `displayIcon` as FileDataID or `Interface\Icons\...` path; then the question mark),
  with a batched, cached client store (`iconStore`, `useAuraIconUrl`).
- `src/core/trigger-spell.ts` (`triggerSpellId`, `setTriggerSpellId`): the spell fields per trigger system
  (`secretAura`/`aura2`: `auraspellids`; generic: `spellName` + `use_spellName`/`use_exact_spellName`).
- `src/components/spell-picker/`: `SpellPicker` (search combobox with keyboard navigation, manual ID entry, Wowhead
  tooltip preview, flags as warnings with explanations, trigger choice) and `SpellSync` (first-run prompt, build + last
  sync). Workbench passes the aura and an `onAuraChange` callback.
- E2E: `tests/e2e/global-setup.ts` seeds `.cache/e2e/spells-<port>.sqlite` from fixtures; the dev server gets it as `SPELL_DB_PATH`.
