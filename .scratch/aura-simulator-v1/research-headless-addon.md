# Research: loading Musca Auras headlessly in wasmoon-lua5.1

Status: done (prototype). Feeds tickets 05 (defaults, validation, combat warnings) and 10 (editor with the game's tabs).

**Question.** Can the real addon Lua (`WeakAuras` + `WeakAurasOptions`, v1.15.0, in TOC order) run in
`wasmoon-lua5.1` with a WoW API shim, far enough to (a) read the default/property registries,
trigger prototypes and Aura (Modern) registries, (b) run the addon's own migration and validation,
and (c) build the in-game options tables and serialize them for a web form?

**Answer: yes, all three.** All 301 Lua files of both addons load without an error, login completes,
and the addon's own `PreAdd` (Modernize + `Display.Migrate` + defaults), `Display.Validate`,
`TriggerStatus`, `Private.AuraWarnings`, `Private.GetProperties` and every `OptionsPrivate.Get*Options`
tab builder run. The options tables evaluate to plain JSON (names, values, ranges, hidden/disabled,
current values) with zero evaluation errors, and edits made through the options' own `set()`
functions update the aura exactly like the in-game editor.

## Prototype

Removed on 2026-11-07: `src/core/addon-vm/` grew from it and supersedes it. It is in git history, e.g.
`git show 634cc0a:prototypes/headless-addon/run.mjs`; the commands and outputs below refer to that tree.

`prototypes/headless-addon/` (plain `.mjs` + Lua, no TypeScript, nothing in `src/`):

| File | Role |
|---|---|
| `loader.mjs` | Creates the VM, parses `.toc` + XML `<Script>/<Include>`, mounts each file in the VM's file system, runs it with `(addonName, Private)` varargs, fires `ADDON_LOADED` / `PLAYER_LOGIN` / `PLAYER_ENTERING_WORLD`, drives the frame loop until `WeakAuras.IsLoginFinished()`. File access is a `readFile(addon, relPath)` callback, so jsDelivr can replace the local install. |
| `shim.lua` | WoW API shim: real shims for values that matter + a logging auto-stub for everything else (see below). |
| `bridge.lua` | Runs one file protected, fires events, ticks `OnUpdate`/timers, JSON encoder (functions, stubs, frames, cycles), AceConfig option-table evaluator. |
| `extract.lua` | The extraction API: `registries()`, `prepare()`, `validate()`, `setupOptions()`, `add()`, `options()`, `setOption()`. |
| `samples.mjs` | Three sample auras written the way an agent would (no defaults). |
| `run.mjs` | End to end: writes `out/*.json`. |
| `probe.mjs`, `repl.mjs`, `summarize.mjs`, `print-options.mjs` | Load report; run a Lua file in the loaded VM; summary of outputs; outline of one options tab. |

Run: `node prototypes/headless-addon/run.mjs [addonsDir]` then
`node prototypes/headless-addon/summarize.mjs` or
`node prototypes/headless-addon/print-options.mjs prototypes/headless-addon/out/options-modern-icon-glow-ok.json trigger`.

Outputs (committed as samples):

- `out/registries.json` (a): `internalVersion` 92, `versionString` 5.22.0, `data_stub`; all 11 region
  types with `default` and condition `properties`; all 14 sub-region types with `displayName`,
  supported region types, per-region defaults and properties; 10 trigger types; 64 event prototypes
  with their `args` (value lists resolved from `Private[...]`); the Load prototype; the Aura (Modern)
  registries `units`, `booleanFilters`, `nativeFilters`, `dispelTypes`, `sortMethods`, `showOnValues`,
  `singleUnits`, `approximateUnits`, `missingTypes`, `remOperators`, `totalOperators`, `stackOperators`,
  `STACK_LIMIT`, plus the file-local `VARIABLES`, `ROOT_PROPERTIES`, `ELEMENT_PROPERTIES`,
  `HIGHLIGHT_SET`, `MISSING_ROOT_NAMES`, `TIME_OPERATORS` of SecretAuraConditions.lua.
- `out/validation.json` (b): per sample the input, the `PreAdd`ed document, `Display.Validate`,
  `ValidateSingle`, `ValidateConditions`, `TriggerStatus` (raw and colour-stripped) and the addon's
  aura warnings after `WeakAuras.Add`. Also the 9 auras in the addon's own Forever tutorial import
  strings (decoded in-VM), migrated from internalVersion 90/91 to 92 without errors.
- `out/options-modern-icon-glow-ok.json`, `out/options-aura2-icon-spellids.json` (c): all eight tabs
  (Display, Trigger, Conditions, Actions, Animations, Load, Custom Options, Information).
- `out/set-option-demo.json`: three edits through the options' `set()` and the validation afterwards.
- `out/load-report.json`: per-file status and time, events, timings, memory, every stubbed API touched.

### Results on the samples

| Sample | `Display.Validate` | `TriggerStatus` |
|---|---|---|
| `modern-icon-glow-ok`: Aura (Modern), player, Arcane Intellect 1459, condition `faAuraRemaining < 180` → `sub.2.glow` | none | "Fully usable in combat. Glow starts once the aura's duration is known." |
| `modern-icon-desaturate-bad`: same, condition drives `desaturate` | "Choose a supported property for this Aura (Modern) condition." | "Won't work: Choose a supported property for this Aura (Modern) condition." |
| `aura2-icon-spellids`: classic Aura trigger with exact spell IDs | "Select an Aura (Modern) trigger as the progress source of an Icon, Progress Bar, Progress Texture or Text." | n/a (not an Aura (Modern)) |

After `setOption` turned on the trigger's Remaining Time (`< 180`) and the icon's Desaturate, the
trigger had `secretUseRem = true, secretRem = "180", secretRemOperator = "<"` and the status became
"Fully usable in combat." The Trigger tab itself shows the same status line (`trigger.1.secretAura.help`).

### Measurements (Node 26, i9-10900F)

- Load both addons: ~350 ms (core ~190 ms, options ~130 ms, VM create ~10 ms). 7.5 MB of Lua source
  (core 4.3 MB, options 3.2 MB; 1.85 MB of that is the ten non-enUS locale files, which return
  immediately and can be left out).
- Lua heap after load: 8.3 MB (`collectgarbage("count")`); 9.2 MB after all extraction below.
- `registries()` 41 ms; prepare + validate + Add for 3 samples and 9 tutorial auras 15 ms;
  all eight option tabs for one aura ~30 ms.
- The core addon alone (no options) is enough for (a) and (b) except the classic-trigger warning,
  which lives in `WeakAurasOptions/TriggerSecretWarnings.lua`.

Browser: not run in a browser here. Nothing in the loader is Node-specific except reading files and
`performance`; `lua.mountFile` uses the VM's in-memory file system, which wasmoon also has in the browser.

## The shim

Strategy as suggested: a permissive auto-stub `_G`, then real shims at the hot spots. Final counts:
580 distinct API paths touched, 269 global names stubbed (25 `C_*` namespaces, 116 ALL_CAPS
GlobalStrings/constants), 71 frame-method names answered by the frame heuristic.

**Real shims** (values matter):

- Lua/WoW aliases: `strmatch strsub strbyte strchar strfind strlen strrep strlower strupper strrev
  format gsub gmatch strtrim strsplit strsplittable strjoin strconcat tinsert tremove sort getn wipe
  tContains tInvert tIndexOf tFilter CopyTable Mixin CreateFromMixins ipairs_reverse floor ceil abs
  sqrt max min random mod fmod rad deg` and degree-based `sin cos tan asin acos atan atan2`.
- **`xpcall` that forwards extra arguments.** WoW's `xpcall(f, handler, ...)` passes `...` to `f`;
  plain Lua 5.1 drops them silently. Without this, `PreAdd` ran `Modernize(nil)` and
  `Display.Migrate(nil)`. Anything else in src/core that calls addon code needs the same shim.
- `bit` (LuaBitOp semantics in pure Lua; WoW has no `bit32`).
- Build/client: `GetBuildInfo` → `"1.60.1", …, 16001`; `WOW_PROJECT_ID = WOW_PROJECT_CLASSIC (2)`
  (an assumption: the addon only reads it in a few places); `GetLocale` enUS; player identity
  (`UnitName/Class/Race/FactionGroup/GUID/Level`), `InCombatLockdown`, `IsLoggedIn`,
  `GetScreenWidth/Height` 1920×1080.
- `C_AddOns.GetAddOnMetadata` from the parsed `.toc` (the options addon refuses to work when its
  `Version` differs from the core's), `IsAddOnLoaded`, `LoadAddOn`; `WeakAurasArchive` counts as loaded.
- `C_Spell` / `GetSpellInfo` answered from a table JS can fill from the spell cache (empty here, so
  the options show "1459 (Unknown Spell)").
- `C_Timer` (recorded; fired by the tick loop), mock `CreateFrame` with scripts, events, size,
  children, attributes; `UIParent`, fonts, `StaticPopupDialogs`, `RAID_CLASS_COLORS`,
  `LOCALIZED_CLASS_NAMES_*`, `CreateColor`/`ColorMixin`, `WrapTextInColorCode`, pools.
- Game data for option lists: `C_CreatureInfo.GetClassInfo/GetRaceInfo` (vanilla classes and races).
- **Client capabilities for validation:** `AuraUtil.IsValidFilterString`. A stub answered nil here,
  so every Aura (Modern) failed with "This client does not support the selected Blizzard aura filters."
- `issecretvalue` → false, `canaccess*` → true, `hooksecurefunc`, `securecall`.

**Auto-stub rules** (each worth knowing because they decide code paths):

- Unknown global → stub object: indexable (child stubs), callable (returns nil; `GetNum*`/`*Count`
  return 0 so `for i = 1, GetNumX()` works), concatenable, arithmetic → 0. Every access is logged.
- ALL_CAPS names (not `C_`/`LE_`) → the name as a string (GlobalStrings), so `"…" .. CLOSE` works.
- Names that must read nil: the addon's own globals (`WeakAuras*`, saved variables), anything with
  `Lib` in the name (LibStub must create the libraries itself), other addons (`Masque`, `ElvUI`,
  `OmniCC`, `DBM`, `BigWigsLoader`, …) and `CUSTOM_CLASS_COLORS`.
- Frame methods: names starting with a WoW verb (`Set/Get/Is/Create/…`) are methods; anything else
  read from a frame is a plain field (nil). `Create*` returns a child frame, `Get*Texture/FontString/…`
  a cached child, `Get*Width/Height/Range/Offset/…` 0, other getters nil.

Remaining harmless errors: `Chomp` (addon comms) and `LibDBIcon` (minimap button) fail in their
`PLAYER_LOGIN` handlers; `AuraBackups` cannot copy to the archive. None affects (a)–(c).

## What works, what doesn't

Works:

- Loading in TOC order with XML includes; login coroutine; `WeakAuras.Add` (regions are created on mock frames).
- (a) every registry listed in the question, including file-local tables reached via `debug.getupvalue`.
- (b) `WeakAuras.PreAdd` = the addon's own "fill defaults + migrate" (Modernize, Display.Migrate,
  region defaults, region validate, data_stub, sub-region defaults). `Display.Validate`,
  `ValidateSingle`, `ValidateConditions`, `TriggerStatus`, `Private.AuraWarnings.GetAllWarnings`.
  The known-bad remaining-time → desaturate aura is flagged; the glow variant passes.
- (c) all tabs; `hidden`, `disabled`, `values`, `min/max/softMin/softMax/step`, `name`, `desc`, `width`
  and the current value from `get()`; multiselect values per key; colours as `[r,g,b,a]`. Edits via `set()`.

Doesn't, or needs care:

- **Answers that depend on the live client are only as good as the shim.** Examples found:
  `AuraUtil.IsValidFilterString` (above); `AuraDisplay.SupportsDurationColorCondition()` is true only
  because `C_CurveUtil`/`Enum.LuaCurveType`/`Enum.DurationTextBindingProperty` are stubs (truthy);
  the classic-trigger warning ("In combat, the game hides some values of this trigger…") comes from
  `C_Secrets` queries. With stubs, `HasSecretRestrictions()` is unknown, so every trigger whose
  `event` is the data_stub default `"Health"` gets the warning, including Aura (Modern) triggers.
  That is the addon's real logic but with an unknown client answer; treat this warning as
  client-dependent until the profile is pinned down in the game.
- Option lists built from client game data are partly empty: class+spec, talents, instance types,
  currencies, zones (`GetDifficultyInfo`, `C_SpecializationInfo`, talent APIs return nothing).
  Classes and races are filled by the shim; the rest needs static data or stays free-text.
- Condition option keys contain `tostring(table)` (e.g. `condition1table: 0x10e4888if`); not stable
  across calls. A form must address conditions by index, not by key.
- Collapsed sections: `hidden` uses the options window's collapse state. The prototype overrides
  `OptionsPrivate.IsCollapsed` to "all expanded" so `hidden` means only the addon's own logic.
- Validation messages are the addon's plain text without a pointer to the option. To point at the
  option (ticket 05), call `AuraDisplay.NativeConditionAllowsProperty(data, check, path)` per condition
  change, or validate per trigger / per condition.
- `execute` options (buttons such as "Add Glow", "Delete", "Apply Template") are listed but not
  evaluated; many open UI (pickers, dialogs) and need a JS-side replacement or a direct `func(info)` call.
- The mixed `triggers` table (array + `activeTriggerMode`) does not map to a JSON array; the
  prototype's JSON writes it as an object with `"1"` keys. src/core already has its own convention
  (`src/core/lua-value.ts`); the extraction should go through that.

## Recommended architecture for src/core

1. **One VM per addon version, loaded once.** `loadAddonVersion(readFile)` → VM. Order: shim →
   core TOC files → `ADDON_LOADED` → `PLAYER_LOGIN` → `PLAYER_ENTERING_WORLD` → tick until login
   finished → options TOC files → `ADDON_LOADED` → options setup (`OptionsPrivate.Private = Private`,
   run `registerRegions`, expand-all `IsCollapsed`). ~350 ms in Node; do it in a Web Worker in the browser.
   Skip non-enUS locale files when fetching.
2. **At load time, extract once and cache as JSON per version** (`registries()`): defaults, region and
   sub-region property tables, prototypes, Aura (Modern) registries, `internalVersion`. These are pure
   data; the renderer and the agent docs page can use them without touching the VM. Diff this JSON
   between versions for "what changed in the options list" (story 46).
3. **Per call, through the VM:**
   - fill defaults/migrate: `WeakAuras.PreAdd(copy)` (not a hand-written merge);
   - validate: `WeakAuras.Add(doc)`, then `Display.Validate`, `TriggerStatus`, `ValidateConditions`,
     `AuraWarnings.GetAllWarnings(uid)`; strip `|c…|r` colour codes and return machine-readable
     `{ code: "wontWork"|"note"|…, message, triggerIndex }`;
   - options schema: `OptionsPrivate.Get<Tab>Options(data)` evaluated to JSON for the current
     document (it depends on the document: which triggers, which sub-elements, what is hidden);
   - edits from the form: call the option's own `set()` and read the document back. This keeps
     every side effect the addon applies on edit (linked fields, migrations, cleanup).
4. **Keep it working across addon versions** (story 47, "clear error if something the app relies on
   is gone"): put every addon entry point the core uses in one contract list and check it right after
   load, failing loudly with the missing name. From this prototype the list is:
   `WeakAuras.PreAdd`, `WeakAuras.Add`, `WeakAuras.GetData`, `WeakAuras.InternalVersion`,
   `WeakAuras.IsLoginFinished`, `Private.regionTypes`, `Private.subRegionTypes`,
   `Private.event_prototypes`, `Private.load_prototype`, `Private.data_stub`, `Private.GetProperties`,
   `Private.GetDataByUID`, `Private.AuraWarnings.GetAllWarnings`, `Private.BlizzardAuraDisplay`
   (`.Validate`, `.TriggerStatus`, `.ValidateSingle`, `.ValidateConditions`, `.GetTrigger`, `.Eligible`,
   `.SupportsRegionType`, registries), `OptionsPrivate.registerRegions`, `OptionsPrivate.IsCollapsed`,
   `OptionsPrivate.Get{Display,Trigger,Condition,Action,Animation,Load,Author,Information}Options`,
   `OptionsPrivate.TriggerSecretWarnings`, and the upvalue names `VARIABLES`, `ROOT_PROPERTIES`,
   `ELEMENT_PROPERTIES`. Run the contract check plus the three samples and the tutorial imports as
   fixtures against every addon version in the test matrix.
5. **Make the client profile explicit.** Move every answer that changes validation into one
   "Forever client profile" table (filter strings, `SupportsDurationColorCondition` ingredients,
   `C_Secrets` answers, `WOW_PROJECT_ID`, build info) and log, at load, any capability probe that
   was answered by a stub. The load report's `touched` list is the starting point.
6. Keep the shim in Lua (it is ~700 lines and runs inside the VM); keep the JS side to file
   fetching, JSON in/out and the contract check.

## Risks

- **Stub truthiness silently changes code paths.** An existence check (`if C_X and C_X.Y then`)
  sees "yes", a capability call sees "no". Both happened in this prototype (filter strings,
  duration-curve support). Mitigation: client profile + logging stub-answered probes + fixtures
  whose expected results were checked in the game (ticket 17).
- **Private internals move between addon versions.** Everything above except `PreAdd`/`Add`/
  `GetData` is addon-private, and the Aura (Modern) code is new and changing quickly (Musca-only
  files). The contract check turns breakage into a clear error instead of wrong output.
- **Upvalue scraping is the most fragile part** (local renamed → not found). The prototype reports
  `"<not found>"` instead of failing; the core should treat it as a contract failure.
- **Options builders assume the options window exists** in places (thumbnails, pickers, OmniCC
  notes, collapse state). They ran here with mock frames, but a future version can call a UI
  function the heuristic answers wrongly. The per-tab error capture in `options()` keeps one broken
  tab from breaking the others.
- **Memory and time in the browser:** ~9 MB Lua heap and 7.5 MB of source per version; fine for one
  version, worth caching per version rather than loading several at once.
- **WoW-only Lua semantics** beyond `xpcall` may appear later (e.g. `string.format` differences,
  `strsplit` edge cases). The shim versions are close but not byte-identical to Blizzard's.
