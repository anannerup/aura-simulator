# Stress test: real TBC auras from wago.io

Date: 2026-11-07. WeakAuras2 5.22.1 with the TBC client profile, at seam A (the aura core).

## What was done

25 popular TBC Anniversary auras from wago.io were run through the aura core. The set is mostly raid packs, boss mods,
class packs, and auras with a lot of custom Lua. They are recorded in `tests/fixtures/wago/tbc/` (`<id>.txt` and
`manifest.json`: name, link, version, size, why chosen, the sha256 of wago's JSON).

- **How they were chosen**: wago's search API, `https://data.wago.io/search?q=type:weakaura expansion:tbc <terms>&sort=popular`, with
  terms like karazhan, gruul, magtheridon, raid, boss, tems, merfin, class and consumables.
- **Skipped as too big** (wago JSON over 2 MB): Merfin T6 (`-NQSiwrk8`, 2.1 MB), Fojji Karazhan (`WYtprjd7T`, 2.3 MB)
  and Karazhan RaidTimers (`B52KUdFwt`, 2.1 MB). The two Fojji ones also need the FojjiCore addon.
- **Fetching**: `api/raw/encoded?id=` returned the import string for every id, and it always equalled the `encoded`
  field of `lookup/wago/code?id=`. Cloudflare sometimes answers the lookup with a challenge page; retrying after a few
  seconds works.

Each aura went through these steps:

1. Decode, then encode and decode again.
2. `toWagoJson`, compared byte for byte with wago's stored JSON (`lookup/wago/code` → `json`), then `fromWagoJson`
   back to the same aura.
3. `validate`.
4. Every tab of the aura and of every aura inside it, opened the way the page opens a selected aura.
5. Option reference coverage: which of the aura's table paths no option writes. This step was informational only.

**Regression test**: `src/core/wago-tbc.test.ts` runs steps 1–4 for the whole set (75 tests, about 2.5 minutes, skipped
offline). It allows only the one Lua error classified below as the aura's own. Wago's JSON is checked by its sha256
in the manifest, so the multi-MB JSON files aren't committed.

## Per aura

The table shows each aura's final result, after the fixes. "Addon messages" are the addon's own validation messages
for the aura, and they are correct (see "Failures by class").

| wago id | Name | Auras | What's in it | Before the fixes | Addon messages (correct) |
|---|---|---|---|---|---|
| z_B1aUtFV | Tems' Tier 4 Pack (Kara, Gruul, Mag) | 93 | combat log, aura2, custom text | encode failed (escape bug) | sound_condition ×6 |
| u2Waemdhl | Tems' SSC/TK Pack | 97 | combat log, custom/addons triggers | clean | sound_action ×5 |
| Y5J7NdyVH | Tems' BT/MH Pack | 109 | aura2, combat log | clean | sound_action ×19 |
| qlVo5dbER | Tems' ZA Pack | 44 | aura2, combat log | clean | sound_action ×2 |
| llwrZsg_d | Tems' SWP Pack | 117 | 4 nested groups, custom triggers | clean (nested-group Add failed silently) | sound ×12, tts_action ×1 |
| PA-hKPPtc | Tems' TBC Dungeons Pack | 155 | aura2, combat log | clean | – |
| 1qyg9npGm | [Merfin] T5 (TK, SSC) | 333 | 47 nested groups, 152 custom triggers, 91 init actions | encode failed (escape bug); nested-group Add failed silently | sound ×60 |
| RVsdd3Yll | Karazhan Trash Requirements | 2 | custom trigger + init | clean | – |
| 4ut4DMIF3 | Eredar Twins – Conflagration | 1 | combat-log custom trigger | clean | sound_action ×1 |
| eolN1wZ3j | KalecgosSync | 6 | addon messages in custom Lua | encode failed (escape bug) | – |
| a7mRKvNf8 | [Merfin] Cube Assigner | 25 | 8 nested groups, 16 custom triggers, custom options | clean (nested-group Add failed silently) | sound_action ×1 |
| WvTWjRwcu | Maey's Auto Marker | 1 | one big init + custom trigger | clean | spammy_event_warning ×1 |
| Mmys_57R_ | TBC Hunter UI (React) | 91 | 12 nested groups, 97 custom triggers | encode failed (escape bug) | – |
| pzFBVUCdX | Dora's Enhancement Shaman Suite | 110 | 23 nested groups, 86 auras with a Talent load option | encode failed; group tabs failed (Lua error); Add failed for every aura (talent API) | – |
| sGScXfEv2 | Paladin (All specs) | 189 | 30 nested groups, 82 auras with a Talent load option | encode failed; group tabs failed; Add failed for every aura | – |
| G6FHkDAOv | nanShield | 5 | combat log + TSU, custom options | clean | – |
| MFeEVBM79 | Baranor's Seal Twist Swing Timer | 3 | custom Lua | clean | – |
| fDDNP0SM7 | tazUI: SwingTimer | 4 | custom trigger | clean | OverridingGlobal ×2 |
| SwSK_MhT1 | Highlight raid frame with important debuff | 10 | custom triggers on raid frames | clean | – |
| LtKzCULNH | T6.5 Raid Frame Glow Trackers | 9 | custom options ×8 | clean | sound_action ×1 |
| wVzrLyWSh | Raid CD Tracker | 19 | 18 custom TSU triggers, 18 custom options | clean | spammy_event_warning ×18 |
| eGjz__yt3 | Incoming Heal Checker | 2 | custom triggers | clean | – |
| _QP-pgykB | Drum Me Daddy | 7 | custom triggers, comms | clean | – |
| j5_HHBbUC | [Merfin] Equipped Items | 4 | inventory APIs in custom code | encode failed (escape bug) | LuaError ×1 (the aura's own) |
| 6N_i-H6uI | Wolde – Clickable Consumables | 16 | 14 TSU triggers, secure buttons, custom options | clean (fixed on main: SafePack) | – |

**Results after the fixes:**

- Every aura round-trips exactly, both as a state code and through wago JSON.
- All 25 wago JSONs are byte-identical to wago's.
- Every tab of all 1,452 auras builds, with no addon error while loading them into the editor.

### The user's own raid packs

These are the user's downloads, run from the scratchpad and not committed: Fojji Karazhan [TBC] v1.0.4 (391 auras),
Fojji [T4] Raiding Pack v1.0.2 and v1.0.4 (218 and 220), Fojji [T5] Raiding Pack (518), Fojji [T5] Raid Frames (115).
`kara.txt` turned out to be the T4 pack (220 auras), and `kara (5).txt` the Karazhan pack (390 auras).

All seven ran through the same checks with the fixes above, 2,072 auras in all:

- Every pack round-trips exactly, as a state code and through wago JSON.
- No Lua errors: the only validation messages are the addon's sound and TTS info (44, 11, 11, 11, 44, 0 and 47).
- Every tab of every aura builds, with no addon error while loading.

### WoW text escapes on the game screen (ours, fixed)

**The report**: in the T5 pack, some texts showed WoW colour codes literally on the game screen
(`|cFFff0000WARNING|r:`), while texts in the Karazhan pack looked coloured.

**Cause**: both packs store the same plain escapes (`|cFFff0000WARNING|r`; no `||c` escaping, and no custom text
function involved). Neither the text region nor the text sub element interpreted any escape: they drew the string
as written. The Karazhan pack's red "WARNING" comes from that text region's own colour, and its sub texts show raw
`|cFF…` too (e.g. its Version Check header).

**Fix**: a WoW font string's escapes are now interpreted on the game screen, in both text renderers (`WowString`):

- `|cAARRGGBB…|r` draws a run in its colour; `|r` returns to the font string's own colour;
- `||` is a literal `|`; `|n` is a line break;
- a hyperlink `|H…|h<text>|h` shows its text;
- inline textures (`|T…|t`) and atlases (`|A…|a`) are left out. Drawing them is a further step.

One tokenizer in the core (`wowTextRuns`, `src/core/wow-text.ts`) serves the game screen, the options window's
labels and `plainText`. The options window's old parser split `||c` (an escaped pipe followed by `c`) as a colour.

## Failures by class

### Our bugs (fixed)

1. **Lua string literals ran escapes together** (`src/core/lua-value.ts`).
   - **Cause**: `luaStringLiteral` wrote non-printable bytes as `\<n>`. Lua 5.1 reads up to three digits, so a
     newline before a line starting with a digit became another character. For example, `"\n100"` became `"e00"`. Where
     the merged escape was over 255, it raised "escape sequence too large".
   - **Impact**: 7 of 25 auras failed to encode. Worse, every aura text going into a Lua VM passes through this
     function: encode, validate, the options editor and edits. So custom code with such a line was silently
     corrupted in validation and the editor. The literal now always writes three digits.
   - **Test**: `aura-core.test.ts` ("Lua table semantics survive the round trip").
2. **The editor registered nested groups wrongly** (`src/core/addon-vm/lua/options.ts`).
   - **Cause**: the editor added a group's auras in export order. Adding a nested group walks its children
     (`ScanForLoadsGroup`), which weren't registered yet, so `WeakAuras.Add` raised for every nested group. The error
     was swallowed silently. The opposite order fails too: `EnsureRegion` walks up to parents that aren't registered.
   - **Fix**: the editor now does what the game's import does (`WeakAurasOptions/OptionsFrames/Update.lua`,
     `ImportPhase1`/`ImportPhase2`). Phase 1 adds every aura top-down without its parent and children
     (`GetPhase1Data`). Phase 2 adds every aura bottom-up as it is.
   - **Errors are no longer silent**: when the addon raises while the editor loads an aura, the error comes back as
     `OptionsTree.warning`, and the editor shows it.
   - **Test**: `weakauras2-tbc.test.ts` ("the editor registers nested groups as the game's import does").
   - **Then: an aura in a group was opened without its groups.** The editor got only the selected aura and its
     descendants. A nested group opened that way raised in `EnsureRegion` (it walks up to the missing parent), and
     every tab of an aura in a group was built without its parent: a dynamic group's child showed its own anchor
     point, which the group decides in the game.
   - **Fix**: the editor loads the whole top-level aura, as the game's window has it, and selects one aura in it
     (`options(topLevel, { selected, tab })`, `setOption(topLevel, { selected, tab, path }, value)`). An edit returns
     the whole top-level aura. The aura stays loaded between calls; what evaluating a tab writes into it is put back
     before an edit, aura by aura. On the T5 raid pack (518 auras with its groups), opening a child loads the pack
     once (about 1.1 s); another tab takes about 20 ms, another aura of the pack about 30 ms, an edit about 170 ms.
   - **Test**: `wago-tbc.test.ts` ("a nested child of a real pack in the editor"), `options-editor.spec.ts` ("an aura
     two levels deep in a pack …").
3. **Validation ignored an Add that raised** (`src/core/addon-vm/validation.ts`).
   - **Cause**: when `WeakAuras.Add` raised for an aura, validation reported nothing. In the game the import fails
     with a Lua error and the aura isn't registered. This is why the talent gap below stayed hidden: the
     Enhancement pack validated clean while none of its 110 auras could be added.
   - **Fix**: new code `add.error` (an error).
   - **What it exposed on Forever**: a worked example of the agent docs had the same silent failure. Musca's
     `SecretAuraGlow.lua:191` takes the animations of an animation group back with `GetAnimations()`, which the
     shim's mock frames answered with nothing. The shim now records `AnimationGroup:CreateAnimation` and returns them
     from `GetAnimations()` in creation order, as the Widget API does (`src/core/addon-vm/lua/shim.ts`).

### Missing client API (fixed)

- **`C_SpecializationInfo.GetTalentInfo`** (`src/core/addon-vm/profile-tbc.ts`).
  - **Evidence it exists on 2.5.6**: Gethe/wow-ui-source `classic_anniversary`,
    `Blizzard_APIDocumentationGenerated/SpecializationInfoDocumentation.lua` documents it (`TalentInfoQuery` →
    `TalentInfoResult`). Ketho's in-game dump (`BlizzardInterfaceResources`, `classic_anniversary`, `GlobalAPI.lua`)
    lists it too.
  - **Why it mattered**: WeakAuras2 defines `Private.ExecEnv.GetTalentInfo` only when the API exists
    (`Compatibility.lua:63`). The profile had marked it absent, so every aura with a Talent load option raised in
    `WeakAuras.Add` (`Prototypes.lua:704`).
  - **Fix**: the profile now answers it from the client data. The global `GetTalentInfo` is FrameXML's own wrapper
    over it (`Blizzard_DeprecatedSpecialization/Deprecated_Specialization_TBC.lua`).
  - **Test**: `weakauras2-tbc.test.ts` ("the Talent load option works").

### Addon messages that are correct

- **`sound_action`, `sound_condition`, `tts_action`** (info): WeakAuras2 notes that the aura plays a sound or TTS.
- **`spammy_event_warning`** (Maey's Auto Marker, Raid CD Tracker): these custom triggers listen to unfiltered
  `COMBAT_LOG_EVENT_UNFILTERED`. WeakAuras2 5.22.1 disables such triggers in the game too.
- **`OverridingGlobal`** (tazUI SwingTimer): the aura's code assigns the global `shortenedName` without `local`.
  WeakAuras2 warns in the game as well.

### The aura's own bug

- **[Merfin] Equipped Items (Version Checker)** (`j5_HHBbUC`) raises `attempt to index a nil value` in its init
  code. It calls `Merfin:L(...)` from the MerfinPlus addon, which wago lists as a dependency. Without MerfinPlus the
  game raises too, as `attempt to index global 'Merfin'`.
- The simulator's message differs because the auto-stub makes `Merfin` exist (see below). It is recorded as the
  aura's own in the manifest (`luaErrors`).

## The auto-stub and an allowlist of real 2.5.6 APIs

**What aura code read through the auto-stub.** I recorded what aura code reached through the auto-stub during
validation and while every tab was built (shim `touched`, minus what an empty icon touches). It falls into three
kinds:

1. **Real 2.5.6 APIs the profile doesn't answer.** The stub returns nil, which reads like "nothing there". Examples:
   `GetTotemInfo`, `GetWeaponEnchantInfo`, `GetInventoryItemID`, `GetInventoryItemTexture`, `GetSpellCooldown`,
   `IsUsableSpell`, `IsResting`, `UnitIsAFK`, `UnitIsDead`, `GetNumSubgroupMembers`, `IsPlayerMoving`,
   `C_Item.GetItemInfo`, `C_Item.GetItemIconByID`, `C_NamePlate.GetNamePlates`,
   `C_ChatInfo.RegisterAddonMessagePrefix`. All of them are in Ketho's in-game dump.
   - `UnitBuff` and `UnitDebuff` aren't C functions on 2.5.6. FrameXML defines them in
     `Blizzard_Deprecated/Deprecated_2_5_5.lua` over `C_UnitAuras`. `CombatLogGetCurrentEventInfo` is defined in
     `Blizzard_DeprecatedCombatLog`.
2. **Other addons' globals and the auras' own globals**: `Merfin` (MerfinPlus), `TBCHunterConfig`, `shortenedName`,
   `GetRotation`, `EventHandler`. In the game these are nil until something sets them. Here they read as a truthy
   stub. The Hunter UI's `_G.TBCHunterConfig = _G.TBCHunterConfig or {}` and its `if _G.TBCHunterConfig then …` take
   the wrong branch.
3. **Numeric constants**: `UPPER_LEFT_VERTEX` and the other `*_VERTEX` constants read as their own names, because of
   the ALL_CAPS rule. On 2.5.6 they are 1–4 (`Blizzard_FrameXMLBase/Classic/Constants.lua:631`). Merfin's T5 pack
   passes them to `SetVertexOffset`.

**No fake `C_*` API.** Every `C_X.Y` that aura code reached exists on 2.5.6. So the allowlist suggested earlier, which
covered only the `C_*` namespaces, would have changed nothing for these 25 auras.

**Judgement: not built now.** The gaps that matter are kind 2. An allowlist that fixes kind 2 must cover the whole
`_G`, which needs three sources merged:

- **Functions and frames from the client**: Ketho's in-game dump for `classic_anniversary`: `GlobalAPI.lua` (5,217 C
  functions, including every `C_X.Y`), `FrameXML.lua` (4,775 Lua functions), `Frames.lua` and `Mixins.lua`.
- **Plain table globals**: `PowerBarColor`, `StaticPopupDialogs`, `ChatTypeInfo`, `Item` and the like. Ketho's
  dump lacks them, so they would come from a scan of the UI source.
- **The deprecation layer's definitions**: `UnitBuff`, `CombatLogGetCurrentEventInfo` and so on.

A name missing from that list would read as nil, so it could wrongly break a real global. That is the opposite of
today's risk, in every addon load and tab sweep.

The kind-2 reads matter only when custom trigger code runs. Today it only compiles, except init actions. So the
allowlist belongs with the decision below about running custom code. The data sources are known and generated:
build it as a generated per-game list next to `client-data-tbc.json`, used by the shim's global `__index`. Rough
effort: 2–3 days, including the tab sweeps for both games. If the custom-code preview isn't built, kind 3 can be
fixed alone by generating the numeric constants from `Constants.lua`.

## Option reference coverage

About 14% of the table paths in these auras (36,337 of 262,831) are written by no option in the reference. Most of
them are expected:

- **Bookkeeping that no option writes**: `uid`, `internalVersion`, `tocversion`, `regionType`, `controlledChildren`,
  wago's stamp (`wagoID`, `url`, `version`, `semver`), `source`, and other addons' keys (`exrtLastSync`).
- **Custom Options**: `authorOptions.#…` (author mode's option definitions) and `config.*` (the user's values). The
  reference doesn't probe the Custom Options tab's author mode deeply. Maey's Auto Marker is 99% this.
- **Defaults stored as empty tables**: `load.*.multi`, `actions.init/start/finish`.
- **Keys that depend on the aura's text**: `displayText_format_<code>_*` per `%`-code, and `animation.main.color*`.
  The reference probes only the default text and the default animation.

The coverage gap worth closing for agents writing tables is author mode of Custom Options (`authorOptions`). It is
the biggest unprobed area that agents would write.

## Known limits left

- **Spec queries still answer "absent".** `C_SpecializationInfo.GetSpecialization`, `GetSpecializationInfo`,
  `GetActiveSpecGroup` and `GetNumSpecializationsForClassID` exist on 2.5.6, but the profile answers them as absent
  so WeakAuras2 takes its classic paths. No aura here needed them; changing it moves the addon's spec code paths.

## What the preview can't show

The preview (`evaluateTbcAura`, `previewSituation`) evaluates triggers in TypeScript from the situation:

- An aura trigger is present or missing, with time left and stacks.
- A spell cooldown trigger is on cooldown or not.
- Every other trigger is "other". It follows the situation's per-trigger present/remaining, and by default it is
  active.

It never runs Lua. So for these auras:

- **Custom triggers** (`status`, `event`, `stateupdate`/TSU) are shown as active by default, whatever their code
  would decide. Clickable Consumables shows all 14 icons as active: its TSU triggers decide from bags, buffs and
  weapon enchants. TSU clones aren't made: a Raid CD Tracker bar per raid member, or Hunter UI's clones.
- **Combat log, unit and event triggers** (most raid-pack auras) can't be driven beyond present/missing.
- **Custom text** (`%c`), **custom conditions**, **custom trigger logic**, **on-init state**
  (`aura_env.*` that other code reads) and **custom animations** aren't run.
- **Secure click actions** (the consumables' `SecureActionButtonTemplate` with `SetAttribute`) can't be simulated
  in a browser at all; only their look can.

## Running custom trigger code in the preview: what it would need

Take Clickable Consumables (`6N_i-H6uI`) as the yardstick. Its 14 TSU triggers use these:

- **Events**: `PLAYER_ENTERING_WORLD`, `PLAYER_EQUIPMENT_CHANGED`, `UNIT_INVENTORY_CHANGED:player`,
  `UNIT_AURA:player`, `GET_ITEM_INFO_RECEIVED`, `ZONE_CHANGED_NEW_AREA`, `WA_OPTIONS`, and the pack's own
  `WOLDE_CONSUMABLE_REFRESH`, `WOLDE_CONSUMABLES_DATA` and `WOLDE_RUNE_REFRESH` (sent with `WeakAuras.ScanEvents`).
- **Client APIs**:
  - `GetItemCount` (×26), for bag contents.
  - `UnitBuff` (×48), for the player's buffs: name, spell id, expiration. On 2.5.6 this is FrameXML's wrapper over
    `C_UnitAuras`.
  - `GetWeaponEnchantInfo` (×20), for the main hand and off hand: present, time left, enchant id.
  - `GetInventoryItemLink`, for the equipped items, such as the chest for the Rune of Warding.
  - `GetItemInfoInstant`, `C_Item.GetItemIconByID` and `GetItemIcon`, for item data.
  - `UnitCastingInfo`, to see that the player is eating.
  - `InCombatLockdown`, `GetInstanceInfo` and `GetTime`.
- **Timers**: `C_Timer.After` and `C_Timer.NewTimer` (×27), for refreshes and the "less than five minutes" countdown.

So running custom code needs four parts:

1. **An event loop.** It fires client events when the simulated state changes, plus a clock that advances
   (`GetTime`, `C_Timer`, OnUpdate). The full VM already has part of this: `__shim.tick` advances `GetTime`, runs
   OnUpdate scripts and due `C_Timer` callbacks, and the shim has event frames.
2. **Simulated game state** behind those APIs:
   - bags (item → count);
   - the player's auras, as `C_UnitAuras` data with spell id, duration and expiration;
   - equipped items by slot;
   - weapon enchants with time left;
   - the current cast;
   - combat and instance.
   For raid packs it would also need group members, other units' auras and casts, and combat log events. That last
   part is a scripted encounter, not a state.
3. **Item data** for TBC Anniversary: names, icons and item classes, generated from wago.tools like the spells, for
   `GetItemInfoInstant`/`GetItemInfo`.
4. **Reading the result back.** The trigger states (TSU `allstates`, clones) must reach the renderers. Also the
   allowlist above, so that absent globals read as nil as they do in the game.

### Options

| Option | What it is | Covers | Rough effort |
|---|---|---|---|
| **A. Keep it as is**, and say so | Custom triggers follow the Situation panel's per-trigger present/remaining. The preview words it: "custom trigger: not run, shown as set". | Display, layout and conditions on trigger state | ~0.5 day (wording in `previewSituation` and the panel) |
| **B. Run only custom trigger functions** in the full VM, against a small simulated state | Call the addon's compiled custom trigger, untrigger, duration and TSU functions with the events the simulator fires. Map TSU states and clones into the TypeScript `TriggerState`. Built-in triggers stay in TypeScript. | Custom and TSU triggers, clones, custom text | 1.5–3 weeks: state model for bags, auras, equipment, enchants and casts; event firing; item data; allowlist; the Situation panel growing inventory and buffs |
| **C. Run the whole addon as the game does** | A third Lua VM with the options closed: WeakAuras2's own trigger systems (BuffTrigger2, GenericTrigger with custom and TSU, conditions, clones, custom text) against the simulated client. The preview reads region states back; the TypeScript evaluation is retired for TBC. | Everything trigger-side, built-in triggers exactly as the addon does them | 4–6 weeks: everything in B, plus a faithful `C_UnitAuras`/cooldown/combat-log model for the built-in triggers, region state read-back, and keeping the two evaluations in step (or replacing one), per game |

Notes for the decision:

- **B** gives the most for auras like Clickable Consumables at moderate cost. Its state model is a subset of C's, so
  it isn't wasted if C follows.
- **C** is the most faithful but rewrites the preview's core, and it would need doing for Forever too, under Musca's
  combat rules.
- **Raid packs** (Tems, Merfin) mostly use combat log and unit triggers during encounters. Neither B nor C helps them
  without scripted encounters (timelines of combat log events), which is a further 1–2 weeks on top.
- **None of the options can click secure buttons.**

## Decision (2026-11-07)

The user chose **option A** for now: the preview does not run custom Lua (custom triggers/TSU, custom text, custom conditions, init/on-show code), and says so clearly per aura in `preview` and on the game screen. B or C may be revisited later.
