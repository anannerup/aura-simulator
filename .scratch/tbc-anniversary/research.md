# Research: WeakAuras on TBC Classic Anniversary (for a "Forever vs Anniversary TBC" selector)

Researched 2026-11-07. Primary sources: the WeakAuras2 repo (cloned at `main` 2837a63, tags 5.21.0–5.22.1),
its release assets, Blizzard's UI source mirror (Gethe/wow-ui-source, branches `classic_anniversary` = 2.5.6.70577 and
`forever` = 1.60.1.70862), wago.tools APIs, Wowhead's tooltip API. "Verified" means I ran it or read the file;
"unverified" is flagged.

## TL;DR (decisive facts)

1. **Players on TBC Anniversary use official WeakAuras2** (github.com/WeakAuras/WeakAuras2). Support landed in commit
   9f40140 "TBC Anniversary support" (2026-01-07), first released in **5.21.0** (2026-01-12). Current: **5.22.1**
   (2026-10-10). One zip serves all flavors; `release.json` lists `{"flavor":"bcc","interface":20506}`.
2. **WeakAuras2 no longer supports retail.** Commit 2f528e4 (2026-01-30) "Remove retail .toc files"; the repo's
   `AGENTS.md` says it supports Classic Era, TBC, Wrath/Titan, Cata, Mists. Retail code paths (`IsRetail()`) remain
   in the Lua but are never active.
3. **The GitHub source tree is NOT loadable as-is (unlike Musca).** It has no `Libs/` (all 20+ libraries are
   `.pkgmeta` externals), empty locale files (`--@localization(...)@` placeholders filled by CurseForge), and
   unprocessed `--@debug@`/`--@alpha@`/`--@experimental@` blocks and `@project-version@`. Musca commits its libs and
   locales. This is the biggest design consequence: load from the **release zip**, or assemble libs yourself.
4. **Flavor is detected from the TOC** (`## X-Flavor: TBC` → `WeakAuras.IsTBC()`), not from `WOW_PROJECT_ID`.
   Musca's TOC says `X-Flavor: Vanilla` (so Musca runs as `IsClassicEra()`).
5. **No secret values on Anniversary.** The 2.5.6 API docs carry essentially no secret annotations (3 ×
   `RequiresNonSecretAura`) versus 5,678 on Forever 1.60.1. Full aura info in and out of combat.
6. **wago.tools product `wow_anniversary`, build `2.5.6.70577`**; all DB2 tables we use exist. Wowhead:
   `/tbc/` path, `dataEnv=5`.
7. **Import compatibility is gated by `internalVersion`**, not by flavor: WA2 5.22.1 = 90, Musca 1.15.0 = 92. A string
   with a higher internalVersion shows "created with a newer version" and **hides the Import button**. So Musca
   exports can't be imported on Anniversary, and the simulator must export with the selected addon's own number
   (it will, since the real Lua builds the string).

## 1. Which build, and how it is packaged

- Repo: https://github.com/WeakAuras/WeakAuras2 (default branch `main`). Releases:
  https://github.com/WeakAuras/WeakAuras2/releases. CurseForge project 65387, Wago addon ID `VBNBxKx5`,
  WoWInterface 24910 (from the TOC). I didn't check CurseForge's own game-version tags for "TBC Anniversary";
  the packager's `release.json` (https://github.com/WeakAuras/WeakAuras2/releases/download/5.22.1/release.json)
  says the zip covers `mists 50504, titan 38002, cata 40402, classic 11509, bcc 20506`.
- **TOC files per flavor** (suffix files, no `-Mainline`/`.toc` without suffix anymore):
  `WeakAuras/WeakAuras_{Vanilla,TBC,Wrath,Cata,Mists}.toc`, same for `WeakAurasOptions`, `WeakAurasTemplates`,
  `WeakAurasModelPaths`, `WeakAurasArchive`. The client picks `_TBC.toc`.
  `WeakAuras/WeakAuras_TBC.toc` (5.22.1):
  ```
  ## Interface: 20506
  # WOW_INTERFACE_TARGETS: tbc-test, tbc
  ## Version: @project-version@
  ## X-Flavor: TBC
  ## AllowLoadGameType: tbc
  ```
  Interface history: 5.21.0–5.21.7 `20505`; 5.21.8 `20505, 20506`; 5.22.0+ `20506`. An `update-wow-interface.yml`
  workflow keeps these current.
- **TBC TOC vs Vanilla TOC** (WeakAuras): TBC loads `Libs\TaintLess\TaintLess.xml`, `Types_TBC.lua` (instead of
  `Types_Vanilla.lua`), and `LibSpecializationWrapper.lua`. WeakAurasOptions_TBC additionally loads
  `AceGUI-Widgets\AceGUIWidget-WeakAurasMiniTalent_Wrath.lua` (the talent-grid load widget). All per-flavor
  `Types_*.lua` files are in the tree; only the TOC decides which one loads, so **the simulator must load files in
  `_TBC.toc` order**, not a merged list.
- **`.pkgmeta`** (repo root): `package-as: WeakAuras`; externals for WeakAuras/Libs: LibStub, CallbackHandler-1.0,
  AceTimer, AceSerializer, AceComm (CurseForge SVN trunk), Chomp, LibSharedMedia-3.0, LibDataBroker-1.1, LibCompress,
  LibDeflate, LibSpellRange-1.0, LibRangeCheck-3.0, LibCustomGlow-1.0, LibDBIcon-1.0, LibGetFrame-1.0, Archivist
  (tag v1.0.8), LibSerialize (tag v1.0.0), LibSpecialization, TaintLess (townlong-yak), LibDispel; for
  WeakAurasOptions/Libs: AceConfig-3.0, AceGUI-3.0, AceGUI-3.0-SharedMediaWidgets, LibUIDropDownMenu,
  LibAPIAutoComplete-1.0. Most are **unpinned** (trunk/main), so rebuilding a tag from source isn't reproducible.
  `ignore`: README/CONTRIBUTING/AGENTS/CLAUDE, `tests`, scripts, LibDeflate docs. `move-folders` flattens the
  sub-addons to the zip root.
- **Build-time processing, verified by diffing tag 5.22.1 source against `WeakAuras-5.22.1.zip`** (ignoring CRLF; the
  zip has CRLF line endings):
  - `@project-version@` → `5.22.1` (TOC `## Version`, `Init.lua` `versionString`, `WeakAurasOptions/VersionCheck.lua`),
    `@build-time@` → timestamp.
  - `--@debug@ … --@end-debug@` → `--[==[@debug@ … --@end-debug@]==]` (commented out); same for `@alpha@`
    (`--[=[`), `@experimental@` (`--[=====[`). In the source tree these blocks are **live**. In `Init.lua`
    the debug block turns `versionString` into `"Dev"` and `buildType = "dev"`; the alpha block sets
    `buildType = "alpha"`. Loading raw source gives `WeakAuras.versionString == "Dev"` → exported `s` field is "Dev".
  - `--@localization(locale=…, namespace="WeakAuras")@` in every `Locales/*.lua` → the CurseForge translations
    (enUS.lua: 10 lines in source, 1,696 in the zip). enUS has a `__index` fallback returning the key, so
    **English works without the substitution** (labels = English keys). Other locales are empty in source.
  - `WeakAurasOptions/Changelog.lua` is generated (65 lines added).
  - No `--@non-retail@`/`--@retail@` style flavor directives are used anywhere in WA2 (grep: none); flavor
    differences are runtime `WeakAuras.Is*()` checks plus per-flavor TOC file lists.
- Release assets: `WeakAuras-<ver>.zip` (~10.5 MB) + `release.json`. **5.21.9 has no assets** (failed/retracted
  release). Release-asset downloads redirect to objects.githubusercontent.com **without CORS headers**, so the zip
  can only be fetched server-side. Branch/commit refs have no zip.
- jsDelivr serves the raw tree (`https://cdn.jsdelivr.net/gh/WeakAuras/WeakAuras2@5.22.1/...`, 435 versions
  listed at `https://data.jsdelivr.com/v1/packages/gh/WeakAuras/WeakAuras2`) — the unprocessed source above.
- Checked reachability of externals for a "source + assembled libs" route: CurseForge SVN over HTTPS works
  (`https://repos.curseforge.com/wow/libstub/trunk/LibStub.lua` 200), GitHub-hosted libs via raw/jsDelivr work;
  `BigWigsMods/LibSpecialization` path differs (404 at the guessed path; `.pkgmeta` points into a subfolder).

**Implication:** two workable routes. (a) Server downloads the release zip per tag, unzips, serves files through the
existing source cache (strip CRLF if needed). Simple and byte-identical to what players run; only works for
released tags. (b) jsDelivr source by any ref + a pinned "libs bundle" (e.g. libs taken from the newest zip) +
emulate the packager's comment stripping for `@debug@`/`@alpha@`/`@experimental@` and `@project-version@`.
Needed for branch/commit refs. Musca needs neither.

## 2. Runtime flavor detection and per-flavor differences

- `WeakAuras/Init.lua`: `flavorFromToc = C_AddOns.GetAddOnMetadata("WeakAuras", "X-Flavor")` mapped
  `{Vanilla=1, TBC=2, Wrath=3, Cata=4, Mists=5, Mainline=10}`. `IsClassicEra()`=1, `IsTBC()`=2, `IsWrathClassic()`=3,
  `IsCataClassic()`=4, `IsMists()`=5, `IsRetail()`=10, plus many combos (`IsClassicOrTBC`, `IsTBCOrWrath`,
  `IsTBCOrWrathOrCataOrMistsOrRetail`, …). `IsTWW()` uses `WeakAuras.BuildInfo >= 110000`, where
  `BuildInfo = select(4, GetBuildInfo())`. There is no `IsBCC()`.
  Our shim already reads `GetAddOnMetadata` from the parsed TOC, so `X-Flavor: TBC` will flow through; the shim's
  hard-coded `GetBuildInfo` (`"1.60.1","60000",…,16001`) and `WOW_PROJECT_ID = WOW_PROJECT_CLASSIC` must become
  per-profile: Anniversary is `GetBuildInfo() → "2.5.6", "70577", <date>, 20506`, and Blizzard's
  `Blizzard_FrameXMLBase/TBC/Constants.lua` sets `WOW_PROJECT_ID = WOW_PROJECT_BURNING_CRUSADE_CLASSIC` (= 5).
- Use counts in WeakAuras+WeakAurasOptions: `IsRetail()` 218, `IsClassicEra()` 58, `IsMists()` 33,
  `IsCataClassic()` 29, `IsWrathClassic()` 25, `IsTBC()` 22 (plus combos).
- Trigger prototypes removed for TBC (`Prototypes.lua` ~12360): `Alternate Power`, `Death Knight Rune`; and via
  `IsClassicOrTBCOrWrathOrCata()`: `Class/Spec`, `Equipment Set`, `Evoker Essence`, `Loot Specialization`,
  `PvP Talent Selected`, and `Threat Situation` only if `UnitDetailedThreatSituation` is missing. `Assisted Combat
  Next Cast` is retail-only (commit 662a3c4 "TBC/Mists: Disable AssistedCombat Trigger"). `Currency` and
  `Spell Activation Overlay` stay on TBC (removed only on Classic Era). `Swing Timer` stays (removed on Cata/Mists).
- Load options: TBC has **no spec** (`specId` absent from the TBC `ScanForLoads` argument list in `WeakAuras.lua`
  ~1775: `…vehicle, vehicleUi, mounted, class, player, realm, …, size, difficulty, difficultyIndex`). Talents use the
  `WeakAurasMiniTalent` grid control with tristate/multi-all semantics (`Prototypes.lua` ~1538), backed by a
  hard-coded `Private.talentInfo` table in `Types_TBC.lua` (4,173 lines) — so talent load options don't need DB2
  answers from the profile, but `GetTalentInfo` and friends still need to answer at runtime if anything calls them
  (check in the profile contract).
  Role: commit e1a0e96 "Classic/TBC/Wrath: add groupRole and fetchRole to BuffTrigger2". TBC uses
  `LibSpecialization` via `LibSpecializationWrapper.lua` (external lib).
- Aura trigger: plain BuffTrigger2 ("Aura"), using `C_UnitAuras.GetAuraDataByIndex`/`AuraUtil.ForEachAura`/
  `GetAuraDataByAuraInstanceID`. **None of Musca's additions exist**: no Aura (Modern)/secret aura trigger, no
  CooldownViewer trigger, no CDM regions, no `SecretConditions`, `TalentReader`, `PlayerSpecialization`,
  `ClassPacks`/`UtilityPacks`/`PackLibrary`, `GroupModernFlow`, `DispelIcon` etc. (≈90 Musca-only Lua files; full
  list from comparing file sets). WA2 has instead `Dragonriding.lua`, `Legendaries.lua`, per-flavor `Types_*`,
  `ModelPaths*`, `TriggerTemplatesData*` and `MiniTalent_*` files.
- Consequence for the simulator: everything restated from Musca (the Forever combat rules in `src/core/conditions/`,
  `mirrored.ts` hashes, the Forever client profile/contract, Aura (Modern) validation) is per-addon. With full aura
  info on Anniversary, the "what shows in combat" rules collapse to plain WA behavior.

## 3. Import/export format

- `WeakAuras/Transmission.lua` (5.22.1): `TableToString` = `LibSerialize:SerializeEx({errorOnUnserializableType=false}, t)`
  → `LibDeflate:CompressDeflate(…, {level = 9})` (level 1 if `C_GameRules.IsHardcoreActive()`) → `"!WA:2!" ..
  LibDeflate:EncodeForPrint(…)`. `StringToTable` still reads `!WA:1!` (AceSerializer) and legacy LibCompress/B64.
  Same as Musca's format family.
- Transmit table (`Private.DisplayToString`): `{ m = "d", d = <data>, v = 1421 | 2000 (2000 if it has children),
  s = WeakAuras.versionString, c = { <children…> } }`. `CompressDisplay` strips `non_transmissable_fields` and sets
  `tocversion = WeakAuras.BuildInfo` (would be 20506 on Anniversary).
- Import checks (`WeakAuras.Import`, `OptionsFrames/Update.lua` ~1400): only **`internalVersion`**. If any
  `data/child.internalVersion > WeakAuras.InternalVersion()` the import dialog shows "This aura was created with a
  newer version of WeakAuras…" and hides Import and View Code. `tocversion` is written but never checked; no flavor
  field exists; no `IsAddOnLoaded` gate. `Private.CompanionData` is only for Wago/Companion update slugs.
  Unknown region types fall back to the `fallback` region with a chat print (`Private.SetRegion`).
- internalVersion by WA2 tag: 5.21.0 = 88, 5.21.5 = 89, 5.21.8–5.22.1 = 90. Musca 1.15.0 = 92.
  ⇒ Codes from retail WA (older) and other classic flavors import on TBC; triggers/load options that the TBC flavor
  lacks become inert/unknown. Musca codes are refused.

## 4. Client data

- wago.tools `https://wago.tools/api/builds/latest`: `wow_anniversary` → **2.5.6.70577** (2026-10-26).
  Others for orientation: `wowf` 1.60.1.70862, `wow_classic_era` 1.15.9.70576, `wow_classic` 5.5.4.70631,
  `wow_classic_titan` 3.80.2.70522; `wow_classic_era_ptr` currently carries a 2.5.6.70006 build (Anniversary PTR).
  The Gethe UI-source branch `classic_anniversary` head is "2.5.6 (70577)", matching.
- DB2 CSV exports for build 2.5.6.70577, all 200 with data: `SpellName`, `SpellMisc` (has `SpellIconFileDataID`
  column family as before; header verified), `ManifestInterfaceData` (33,446 rows vs 134,284 for wowf),
  `ChrClasses`, `Talent` (has TabID/TierID/ColumnIndex/SpellRank_*), `TalentTab`, `Difficulty`, `ItemSubClass`.
  (`ChrSpecialization`, `SpellIcon` → "Table not found", not needed.)
- CASC: `https://wago.tools/api/casc/<FileDataID>` works with CORS `*`. All Blizzard FileDataIDs in
  `src/render/media.ts`/`textures/paths.ts` that are in wowf's ManifestInterfaceData are also in Anniversary's;
  the font IDs (615958–615972) are in neither manifest (they're under `Fonts\`) and download fine.
  **Unverified:** whether the casc endpoint honors a product/version parameter (`?version=`/`?branch=` returned the
  same bytes); FileDataIDs are global, so this only matters if a file's content differs per product.
- Wowhead: `https://nether.wowhead.com/tbc/tooltip/spell/<id>?dataEnv=5` returns TBC data (e.g. Lifebloom 33763;
  the same ID returns "Entity not found" on `classic`/`dataEnv=4`). Wowhead's `/tbc/` section is its TBC
  Anniversary hub (news about "Burning Crusade Classic Anniversary" phases on https://www.wowhead.com/tbc).
  Tooltip links point to `/tbc/spell=…`.

## 5. Combat restrictions

- Anniversary 2.5.6 runs the same modern engine family as Forever (the generated API docs include
  `SecretPredicateAPIDocumentation.lua` etc.), but **the APIs are not marked secret**: tallying annotations in
  `Blizzard_APIDocumentationGenerated/*.lua` gives 3 × `RequiresNonSecretAura = true` on `classic_anniversary` versus
  3,684 `SecretArguments="AllowedWhenUntainted"`, 949 `NeverSecret`, 23 `SecretWhenUnitAuraRestricted`, … on
  `forever`. So no Forever-style secret values on Anniversary. (Inference from docs; I did not test in-game.)
- Aura APIs present (`UnitAuraDocumentation.lua`, 2.5.6): `C_UnitAuras.GetAuraDataByIndex`, `GetAuraDataByAuraInstanceID`,
  `GetAuraDataBySlot`, `GetAuraSlots`, `GetAuraDataBySpellName`, `GetBuffDataByIndex`, `GetDebuffDataByIndex`,
  `GetPlayerAuraBySpellID`, `GetUnitAuraBySpellID`, `GetUnitAuras`, `GetUnitAuraInstanceIDs`, `GetAuraDuration`,
  `DoesAuraHaveExpirationTime`, `GetAuraApplicationDisplayCount`, private-aura functions, the `UNIT_AURA` event.
  Legacy `UnitAura`/`UnitBuff`/`UnitDebuff` are provided by `Blizzard_Deprecated/Deprecated_2_5_5.lua`.
  `AuraUtil.ForEachAura` is in `Blizzard_FrameXMLUtil/AuraUtil.lua`. WA2's BuffTrigger2 wraps
  `C_UnitAuras.GetAuraDataByIndex` into an `UnitAura`-shaped local.

## 6. Other simulator-relevant differences

- Region types registered in WA2 5.22.1: `icon`, `aurabar`, `text`, `texture`, `progresstexture`, `stopmotion`,
  `model`, `group`, `dynamicgroup`, `empty`, `fallback`. Sub-regions: `subbackground`, `subforeground`, `subtext`,
  `subborder`, `subglow`, `subtick`, `submodel`, `substopmotion`, `subtexture`, `subcirculartexture`,
  `sublineartexture`. StopMotion is built in (the external WeakAurasStopMotion addon is optional extra textures).
- Glow: LibCustomGlow-1.0 (external, `Stanzilla/LibCustomGlow`, unpinned). Masque: `OptionalDeps` only, not bundled.
- Model paths: `WeakAurasModelPaths/ModelPathsTBC.lua` (~78k lines) for the model picker; updated by a bot
  "Update WeakAurasModelPaths from wago.tools".
- Templates: `WeakAurasTemplates/TriggerTemplatesDataTBC.lua` feeds the New Aura page (instead of Musca's
  `TriggerTemplatesDataForever.lua` and class/utility packs).
- Media: WA's own `WeakAuras/Media` and `PowerAurasMedia` are in the source tree (fetchable by tag from jsDelivr);
  addon-path textures will need the WA2 repo URL instead of Musca's in `textures/paths.ts`.
- The `Cache.lua` icon-ID "holes" table has a TBC branch (Options spell cache).
- The TBC TOC adds TaintLess (no-op for us) and LibSpecialization/LibDispel (externals).

## 7. Release cadence, tags, branches

- Tags are bare semver (`5.22.1`, no `v`), plus old `dragonflight-beta-N` tags; ~427 tags total (GitHub tags
  API needs paging — current code pages up to 10×100). jsDelivr lists 435 versions.
- Cadence: 5.21.0 (2026-01-12) … 5.21.11 (2026-08-19), 5.22.0 (2026-09-05), 5.22.1 (2026-10-10): roughly monthly,
  bursts around patches. All non-prerelease. TBC Anniversary support starts at 5.21.0, so a selector for the
  Anniversary client should offer ≥ 5.21.0 only.
- Branches: `main` (development), `cata`, feature/copilot branches, `update-modelpaths`, `update-atlasfiles`.
  Branch/commit refs exist only as raw source (see §1 implication).

## Open questions / not verified

- Whether to support branch/commit refs for WA2 at all (needs the libs/locales/directive emulation route) or only
  released tags via the zip.
- Whether wago.tools CASC serves per-product file versions; whether any texture the renderers use differs on 2.5.6.
- In-game confirmation that combat auras are unrestricted on Anniversary (doc-based inference).
- CurseForge/Wago listing of the "TBC Anniversary" game version for the WA2 file (packager metadata says `bcc`
  20506; not checked on the sites).
- Which further client answers the Anniversary profile needs (e.g. `GetTalentInfo`, `C_GameRules`, `GetNumShapeshiftForms`,
  LibSpecialization's API use) — to be found by loading `_TBC.toc` in the VM and fixing what errors.
