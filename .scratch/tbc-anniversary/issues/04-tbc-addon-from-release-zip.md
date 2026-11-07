# 04: TBC: WeakAuras2 from its release zip, with a TBC client profile

**What to build:** the `/tbc` site loads official WeakAuras2:
- The server lists tags that have a release zip (5.21.0 and later), downloads the zip, and caches the unpacked files per game and version.
- It serves the `_TBC.toc` file sets as bundles.
- The light VM encodes and decodes; the full VM loads WeakAuras + WeakAurasOptions with a TBC client profile:
  - GetBuildInfo 2.5.6 / 70577 / 20506;
  - flavor from the TOC;
  - no 12.0 APIs;
  - entries marked unverified.
- Split the addon contract and extractors into common and per-game parts.
- The window works on `/tbc` with WeakAuras2's own tabs; New Aura shows only what WeakAuras2 offers.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Recorded 5.22.1 zip fixture; the core round-trips a code; versionString is the release's, not "Dev"
- [ ] Every tab builds for every display type (tab sweep for TBC)
- [ ] Importing a code with a newer internal version behaves as WeakAuras2's import does
- [ ] `/tbc` opens a working window; the picker enables TBC

## Progress (first half: core and server pieces, before 01 lands)

Done on its own branch, without routes or UI:
- `src/server/addon/weakauras2-releases.ts` (+ `unzip.ts`): lists tags ≥ 5.21.0 with a `WeakAuras-<tag>.zip`, downloads
  a release once, checks GitHub's sha256, unpacks it on disk per version, serves files, a fetcher and light/full bundles
  of the `_TBC.toc` sets.
- Core: `loadAddon(ref, { game: "tbc", fetchSource })`; `tocPath` picks `<Addon>_TBC.toc`; TBC client profile
  `addon-vm/profile-tbc.ts` (every answer marked UNVERIFIED); contract split into `COMMON_CONTRACT` / `FOREVER_CONTRACT`
  and the extractors into `lua/extract.ts` / `lua/extract-forever.ts` (`addon-vm/games.ts` ties them per game).
- Seam A: `src/core/weakauras2-tbc.test.ts` (round trip, versionString 5.22.1, internalVersion 90, TBC flavor,
  Load tab data, validation, fillDefaults) and the tab sweep per game in `src/core/options-sweep.test.ts`.
- Fixture: the zip (10.5 MB; its `_TBC.toc` file sets are 4.8 MB of Lua) is not committed. Tests download it once into
  `.cache/weakauras2`, checked against the recorded sha256 in `tests/fixtures/weakauras2/github-releases.json`, and
  skip when offline.

Left for the second half (after 01):
- Serve the release cache through the `/tbc` site's version list and bundle routes; the page's aura core loads with
  `game: "tbc"` and the bundle fetcher.
- New Aura on `/tbc`: `newAuraPage()` still returns Musca's Modern Aura Group and Packs buttons (and `packs()` fails on
  WeakAuras2); make them Forever-only.
- Story 7 (newer internalVersion on import), e2e tab sweep for `/tbc`, the picker.
