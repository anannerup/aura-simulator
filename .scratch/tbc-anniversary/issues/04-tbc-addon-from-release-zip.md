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
