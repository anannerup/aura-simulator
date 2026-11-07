/**
 * The addon files the simulator's rules and renderers restate, per game, pinned by content; and which of our modules
 * are shared between the games although they port files that differ.
 *
 * `mirrored.test.ts` fails when a pinned file differs at the game's `ref`, when `ref` is not the game's default
 * addon version, or when a file's sameness between the games changes. On an addon update, re-check the rules and
 * renderers that cite the changed files (and, for a shared module, whether the difference now affects behaviour),
 * then record the new hashes and ref.
 *
 * The abstraction rule: a module is shared between the games only while the Lua it ports does the same thing in
 * both addons. "Same" is byte-identical text (line endings aside: WeakAuras2's release zip has CRLF, Musca's
 * repository LF). Where a shared module ports a file that differs, `SharedPort.differs` says why the difference does
 * not change what the module draws or decides; where it does, the module has a per-game part, named there.
 */
import type { AddonGameId } from "./addon-vm/toc";

export interface GameMirror {
  /** The addon version the hashes are of: the game's default version. */
  ref: string;
  /** Path in the addon's files → first 16 hex digits of the SHA-256 of the file's text as the game's source reads it. */
  files: Record<string, string>;
}

export const MIRRORED: Record<AddonGameId, GameMirror> = {
  /** Musca Auras (GitHub tag; `DEFAULT_ADDON_REF`). */
  forever: {
    ref: "v1.15.0",
    files: {
      "WeakAuras/Animations.lua": "ff7c058997d1cdc5",
      "WeakAuras/BaseRegions/CircularProgressTexture.lua": "9e06d4cbfd70cb1d",
      "WeakAuras/BaseRegions/LinearProgressTexture.lua": "d468d18515271943",
      "WeakAuras/BaseRegions/StopMotion.lua": "69c7bede67b2dba2",
      "WeakAuras/BaseRegions/Texture.lua": "f94acb0005650262",
      "WeakAuras/BaseRegions/TextureCoords.lua": "9bde78febbba4dff",
      "WeakAuras/BuffTrigger2.lua": "a5284094c8e9fccd",
      "WeakAuras/BuffTriggerNativeFilter.lua": "4778f3b5c233b9e7",
      "WeakAuras/Conditions.lua": "980aace96da09133",
      "WeakAuras/DefaultOptions.lua": "7a11e3ddd872de55",
      "WeakAuras/FrozenMarker.lua": "3cbffc85c88c243d",
      "WeakAuras/NativeProgressPainter.lua": "f5abdc26cc38b495",
      "WeakAuras/ProgressTextureNative.lua": "0c72c43b26659e70",
      "WeakAuras/Prototypes.lua": "f52d5f38d9056417",
      "WeakAuras/RegionTypes/AuraBar.lua": "836e968af6add741",
      "WeakAuras/RegionTypes/DynamicGroup.lua": "8715e93853b2310f",
      "WeakAuras/RegionTypes/Empty.lua": "5d10bca74b39961a",
      "WeakAuras/RegionTypes/Group.lua": "836f8a853514e406",
      "WeakAuras/RegionTypes/Icon.lua": "0143dbceda5c44e4",
      "WeakAuras/RegionTypes/Model.lua": "f07e21b84631b66f",
      "WeakAuras/RegionTypes/ProgressTexture.lua": "aeece6dbd4a45851",
      "WeakAuras/RegionTypes/ProgressTextureSecret.lua": "178233cee9905c3e",
      "WeakAuras/RegionTypes/RegionPrototype.lua": "025b1295e2d6d341",
      "WeakAuras/RegionTypes/StopMotion.lua": "57396950edabb7ac",
      "WeakAuras/RegionTypes/Text.lua": "9003d4be072d2127",
      "WeakAuras/RegionTypes/Texture.lua": "16e428320db61d7d",
      "WeakAuras/SecretAuraAnchor.lua": "c4ca57a833e44c2d",
      "WeakAuras/SecretAuraAppearance.lua": "7c9392282adbff3f",
      "WeakAuras/SecretAuraConditions.lua": "6fe9f55f75a0a6e0",
      "WeakAuras/SecretAuraFlow.lua": "6539324140b6dc77",
      "WeakAuras/SecretAuraSingle.lua": "c13509b0c1f0a5d4",
      "WeakAuras/SecretAuraSingleFollow.lua": "f55ea20891501223",
      "WeakAuras/SecretAuraSingleGates.lua": "f57747fff5db47ce",
      "WeakAuras/SubRegionTypes/Background.lua": "cd0a9d195216ce6e",
      "WeakAuras/SubRegionTypes/Border.lua": "0ccb4fa154c13f88",
      "WeakAuras/SubRegionTypes/CircularProgressTexture.lua": "a005a3278a6bd775",
      "WeakAuras/SubRegionTypes/Glow.lua": "9db35e283939470f",
      "WeakAuras/SubRegionTypes/LinearProgressTexture.lua": "26a26a1c3bb1a449",
      "WeakAuras/SubRegionTypes/Model.lua": "946843ce7cd3e824",
      "WeakAuras/SubRegionTypes/StopMotion.lua": "de24dc0b487b8975",
      "WeakAuras/SubRegionTypes/SubText.lua": "550708d778c8db5f",
      "WeakAuras/SubRegionTypes/Texture.lua": "44a149682bf78300",
      "WeakAuras/SubRegionTypes/Tick.lua": "64cf70b30aada5ee",
      "WeakAuras/TextStyle.lua": "370f68a42e56d76a",
      "WeakAuras/Types.lua": "7dc43a88f2f3ebee",
      "WeakAuras/WeakAuras.lua": "f231f6547faac787",
      "WeakAurasOptions/RegionOptions/DynamicGroup.lua": "7542ee80a9e280d2",
    },
  },
  /** WeakAuras2 from its release zip (the tag the TBC tests load; the server's default is the newest release). */
  tbc: {
    ref: "5.22.1",
    files: {
      "WeakAuras/Animations.lua": "63bf9567e3e1bb97",
      "WeakAuras/BaseRegions/CircularProgressTexture.lua": "f1be7481b02a78f2",
      "WeakAuras/BaseRegions/LinearProgressTexture.lua": "847ec5c58e1fa96c",
      "WeakAuras/BaseRegions/StopMotion.lua": "7ca4ca431c766565",
      "WeakAuras/BaseRegions/Texture.lua": "58d153363b03f13f",
      "WeakAuras/BaseRegions/TextureCoords.lua": "0d1b701036066fe4",
      "WeakAuras/BuffTrigger2.lua": "8dec01cb7c48cbde",
      "WeakAuras/Conditions.lua": "dbd1f3d5c1b77e9d",
      "WeakAuras/DefaultOptions.lua": "a36d79c535e54806",
      "WeakAuras/Prototypes.lua": "690770edae562a1d",
      "WeakAuras/RegionTypes/AuraBar.lua": "0f1d0c209f27cbf7",
      "WeakAuras/RegionTypes/DynamicGroup.lua": "3d579dfae1e3254d",
      "WeakAuras/RegionTypes/Empty.lua": "198ab669bc44953e",
      "WeakAuras/RegionTypes/Group.lua": "d9aabf5a69f90be1",
      "WeakAuras/RegionTypes/Icon.lua": "1868f8bf0dad0cd3",
      "WeakAuras/RegionTypes/Model.lua": "e18217c58e3cd313",
      "WeakAuras/RegionTypes/ProgressTexture.lua": "9b37d1aebe51bba0",
      "WeakAuras/RegionTypes/RegionPrototype.lua": "683fdfdb32ea9d62",
      "WeakAuras/RegionTypes/StopMotion.lua": "237c8066e51deefe",
      "WeakAuras/RegionTypes/Text.lua": "a713dc0ca6012d52",
      "WeakAuras/RegionTypes/Texture.lua": "e3123c9747b7403f",
      "WeakAuras/SubRegionTypes/Background.lua": "345d649cbbffc00e",
      "WeakAuras/SubRegionTypes/Border.lua": "6cbe0189e4286d47",
      "WeakAuras/SubRegionTypes/CircularProgressTexture.lua": "342017ed1238d643",
      "WeakAuras/SubRegionTypes/Glow.lua": "6861247f3fa02d28",
      "WeakAuras/SubRegionTypes/LinearProgressTexture.lua": "5fd4eca6df0a8430",
      "WeakAuras/SubRegionTypes/Model.lua": "0e6d245a66335d00",
      "WeakAuras/SubRegionTypes/StopMotion.lua": "a3dc4497463f5f63",
      "WeakAuras/SubRegionTypes/SubText.lua": "3c9712cacd40ceb5",
      "WeakAuras/SubRegionTypes/Texture.lua": "5f5cc79aa4876f66",
      "WeakAuras/SubRegionTypes/Tick.lua": "900feb2d2b0b5aab",
      "WeakAuras/Types.lua": "fe142d639b8f20c9",
      "WeakAuras/WeakAuras.lua": "ec1ec5bbbf27c422",
      "WeakAurasOptions/RegionOptions/DynamicGroup.lua": "33ed6096c915898f",
    },
  },
};

/** One of our modules that both games use, and the addon files it ports. */
export interface SharedPort {
  /** Path in this repository. */
  module: string;
  /** Files it ports that both addons have (each pinned in both games). */
  files: string[];
  /**
   * For each of `files` whose text differs between the addons (and only those): why the module stays shared, or
   * which part of it is per game. The test fails when a file's sameness changes.
   */
  differs: Record<string, string>;
  /**
   * Musca-only files the module also ports (pinned for Forever only): their parts only run for document keys or
   * trigger kinds that WeakAuras2 doesn't have, so they never run on TBC.
   */
  foreverOnly?: string[];
}

// Reasons used by several modules.
const SECRET_ONLY =
  "Musca adds only secret-value handling (IsSecret guards, Secret*/native setters, SetDesaturation helpers) and " +
  "Cooldown Manager hooks; the plain path the module ports is the same.";
const REFACTOR =
  "Musca restructures the file (helpers split out) and adds secret-value, native-text and Cooldown Manager paths; " +
  "the plain WeakAuras behaviour the module ports is unchanged.";

export const SHARED_PORTS: SharedPort[] = [
  // --- Rules (src/core) ---
  {
    module: "src/core/conditions/evaluate.ts",
    files: ["WeakAuras/Conditions.lua"],
    differs: {
      "WeakAuras/Conditions.lua":
        "Musca adds the Aura (Modern) hooks (skip native checks, ValidateConditions gate, SetSecretAuraConditionProperty " +
        "in combat), IsSecret guards, resetValue for unset bases and group conditions. The generic checks, linked " +
        "chains and property merging are the same; the Forever hooks live in forever.ts (the `skip` check, held properties).",
    },
  },
  {
    module: "src/core/conditions/triggers.ts",
    files: ["WeakAuras/BuffTrigger2.lua", "WeakAuras/Prototypes.lua"],
    differs: {
      "WeakAuras/BuffTrigger2.lua":
        "matchesShowOn, the rem/stacks checks with their >= defaults and unitExists are the same in both; Musca adds " +
        "an elapsed check (not modelled), native filters and restricted-aura refreshes (Forever's freezing is in forever.ts).",
      "WeakAuras/Prototypes.lua":
        "Cooldown Progress (Spell)'s genericShowOn tests and its onCooldown/charges variables are the same. Per game: " +
        "Musca's 'Desaturate while on cooldown' (use_desaturateOnCooldown) doesn't exist in WeakAuras2, so it is in forever.ts only.",
    },
  },
  {
    module: "src/core/conditions/region-defaults.ts",
    files: [
      "WeakAuras/RegionTypes/Icon.lua",
      "WeakAuras/RegionTypes/AuraBar.lua",
      "WeakAuras/RegionTypes/Text.lua",
      "WeakAuras/RegionTypes/Texture.lua",
      "WeakAuras/RegionTypes/ProgressTexture.lua",
      "WeakAuras/RegionTypes/StopMotion.lua",
      "WeakAuras/SubRegionTypes/SubText.lua",
      "WeakAuras/SubRegionTypes/Glow.lua",
      "WeakAuras/SubRegionTypes/Border.lua",
      "WeakAuras/SubRegionTypes/Tick.lua",
      "WeakAuras/SubRegionTypes/Texture.lua",
      "WeakAuras/SubRegionTypes/LinearProgressTexture.lua",
      "WeakAuras/SubRegionTypes/CircularProgressTexture.lua",
      "WeakAuras/SubRegionTypes/StopMotion.lua",
      "WeakAuras/SubRegionTypes/Model.lua",
    ],
    differs: {
      "WeakAuras/RegionTypes/Icon.lua": REFACTOR,
      "WeakAuras/RegionTypes/AuraBar.lua": SECRET_ONLY,
      "WeakAuras/RegionTypes/Text.lua":
        "Only Musca adds `alpha = 1` to the text region's defaults (AddAlphaToDefault). Unset, WeakAuras2 draws the " +
        "text at alpha 1 too (SetRegionAlpha(nil) → 1), so the default draws the same.",
      "WeakAuras/RegionTypes/Texture.lua": SECRET_ONLY,
      "WeakAuras/RegionTypes/ProgressTexture.lua": SECRET_ONLY,
      "WeakAuras/RegionTypes/StopMotion.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/SubText.lua": REFACTOR,
      "WeakAuras/SubRegionTypes/Glow.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/Border.lua":
        "Musca adds `border_dispelColor` (dispel-type colours); the renderer doesn't model it, and the defaults it uses are the same.",
      "WeakAuras/SubRegionTypes/Tick.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/Texture.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/LinearProgressTexture.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/CircularProgressTexture.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/StopMotion.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/Model.lua":
        "Only the default model differs (WeakAuras2 on TBC: 124614, Musca: 235338); region-defaults uses neither.",
    },
  },
  // --- Renderers (src/render) ---
  {
    module: "src/render/IconRegion.tsx",
    files: ["WeakAuras/RegionTypes/Icon.lua", "WeakAuras/RegionTypes/AuraBar.lua"],
    differs: { "WeakAuras/RegionTypes/Icon.lua": REFACTOR, "WeakAuras/RegionTypes/AuraBar.lua": SECRET_ONLY },
  },
  {
    module: "src/render/AuraBarRegion.tsx, src/render/bar-geometry.ts",
    files: ["WeakAuras/RegionTypes/AuraBar.lua", "WeakAuras/RegionTypes/RegionPrototype.lua", "WeakAuras/SubRegionTypes/Tick.lua"],
    differs: {
      "WeakAuras/RegionTypes/AuraBar.lua": SECRET_ONLY,
      "WeakAuras/RegionTypes/RegionPrototype.lua":
        "Musca adds duration objects, secret progress, a 'Looping Animation' condition property and group condition " +
        "properties; the number/timed progress the renderers port is the same (min/max, value - adjustMin).",
      "WeakAuras/SubRegionTypes/Tick.lua": SECRET_ONLY,
    },
    foreverOnly: ["WeakAuras/SecretAuraSingleFollow.lua"],
  },
  {
    module: "src/render/TextRegion.tsx",
    files: ["WeakAuras/RegionTypes/Text.lua"],
    differs: {
      "WeakAuras/RegionTypes/Text.lua":
        "Musca pins an auto-width text to the region's anchor point instead of `justify` and adds layered condition " +
        "texts for secret values. An auto-width region is as wide as its text, so the pin point draws the same; " +
        "fixed width uses `justify` in both.",
    },
  },
  {
    module: "src/render/fonts.ts",
    files: ["WeakAuras/Types.lua"],
    differs: {
      "WeakAuras/Types.lua":
        "font_flags and the LibSharedMedia registrations are the same; the differences are flavor tables (textures, " +
        "difficulties, pet behaviour), WeakAuras2's retail-only 'Modern Blizzard' time format and secret guards.",
    },
    // WeakAuras2 does in Text.lua/SubText.lua what Musca's TextStyle.lua does; for the font flags both addons offer,
    // only "OUTLINE|SLUG" drops the shadow in both.
    foreverOnly: ["WeakAuras/TextStyle.lua"],
  },
  {
    module: "src/render/text-format.ts",
    files: ["WeakAuras/Types.lua", "WeakAuras/Prototypes.lua"],
    differs: {
      "WeakAuras/Types.lua":
        "The timed formatters the module ports are the same; WeakAuras2's extra format 2 ('Modern Blizzard') is " +
        "retail-only (false on TBC), and Musca adds secret-number guards.",
      "WeakAuras/Prototypes.lua": "The text replacements ported are the same; the file differs in trigger prototypes per flavor.",
    },
  },
  {
    module: "src/render/TextureRegion.tsx, src/render/texture-geometry.ts",
    files: [
      "WeakAuras/RegionTypes/Texture.lua",
      "WeakAuras/BaseRegions/Texture.lua",
      "WeakAuras/BaseRegions/TextureCoords.lua",
      "WeakAuras/BaseRegions/LinearProgressTexture.lua",
      "WeakAuras/BaseRegions/CircularProgressTexture.lua",
    ],
    differs: {
      "WeakAuras/RegionTypes/Texture.lua": SECRET_ONLY,
      "WeakAuras/BaseRegions/Texture.lua": SECRET_ONLY,
      "WeakAuras/BaseRegions/LinearProgressTexture.lua": SECRET_ONLY,
      "WeakAuras/BaseRegions/CircularProgressTexture.lua": SECRET_ONLY,
    },
  },
  {
    module: "src/render/ProgressTextureRegion.tsx, src/render/progress-texture.ts",
    files: [
      "WeakAuras/RegionTypes/ProgressTexture.lua",
      "WeakAuras/RegionTypes/RegionPrototype.lua",
      "WeakAuras/BaseRegions/LinearProgressTexture.lua",
      "WeakAuras/BaseRegions/CircularProgressTexture.lua",
    ],
    differs: {
      "WeakAuras/RegionTypes/ProgressTexture.lua": SECRET_ONLY,
      "WeakAuras/RegionTypes/RegionPrototype.lua": "See bar-geometry: the plain progress is the same.",
      "WeakAuras/BaseRegions/LinearProgressTexture.lua": SECRET_ONLY,
      "WeakAuras/BaseRegions/CircularProgressTexture.lua": SECRET_ONLY,
    },
    // The native (Aura (Modern)) variant: only for auras with a secretAura trigger.
    foreverOnly: ["WeakAuras/RegionTypes/ProgressTextureSecret.lua", "WeakAuras/ProgressTextureNative.lua", "WeakAuras/NativeProgressPainter.lua"],
  },
  {
    module: "src/render/StopMotionRegion.tsx, src/render/stop-motion.ts",
    files: ["WeakAuras/RegionTypes/StopMotion.lua", "WeakAuras/BaseRegions/StopMotion.lua", "WeakAuras/Types.lua"],
    differs: {
      "WeakAuras/RegionTypes/StopMotion.lua": SECRET_ONLY,
      "WeakAuras/BaseRegions/StopMotion.lua": SECRET_ONLY,
      "WeakAuras/Types.lua": "The stop motion texture data is the same.",
    },
  },
  {
    module: "src/render/ModelRegion.tsx",
    files: ["WeakAuras/RegionTypes/Model.lua", "WeakAuras/RegionTypes/Empty.lua"],
    differs: {
      "WeakAuras/RegionTypes/Model.lua":
        "WeakAuras2 defaults the model to 124614 on TBC (Musca: 122968) and listens for focus changes. Models aren't " +
        "drawn, only a labelled placeholder; the fallback label is only reached for a document without " +
        "model_fileId, which both addons fill in on import.",
    },
  },
  {
    module: "src/render/AnimatedAuraRegion.tsx, src/render/animations.ts",
    files: ["WeakAuras/Animations.lua", "WeakAuras/Types.lua", "WeakAuras/RegionTypes/RegionPrototype.lua", "WeakAuras/Prototypes.lua"],
    differs: {
      "WeakAuras/Animations.lua": "Musca adds secret guards (colour and size start values) and a helper; the animation maths is the same.",
      "WeakAuras/Types.lua": "Easing and animation presets are the same.",
      "WeakAuras/RegionTypes/RegionPrototype.lua":
        "Musca's 'Looping Animation' condition property (conditionAnimation) isn't modelled; the rest the module ports is the same.",
      "WeakAuras/Prototypes.lua": "The animation function strings ported are the same.",
    },
  },
  {
    module: "src/render/glow",
    files: ["WeakAuras/SubRegionTypes/Glow.lua"],
    differs: { "WeakAuras/SubRegionTypes/Glow.lua": SECRET_ONLY },
  },
  {
    module: "src/render/subregions",
    files: [
      "WeakAuras/SubRegionTypes/SubText.lua",
      "WeakAuras/SubRegionTypes/Border.lua",
      "WeakAuras/SubRegionTypes/Tick.lua",
      "WeakAuras/SubRegionTypes/Glow.lua",
      "WeakAuras/SubRegionTypes/Texture.lua",
      "WeakAuras/SubRegionTypes/LinearProgressTexture.lua",
      "WeakAuras/SubRegionTypes/CircularProgressTexture.lua",
      "WeakAuras/SubRegionTypes/StopMotion.lua",
      "WeakAuras/SubRegionTypes/Model.lua",
      "WeakAuras/SubRegionTypes/Background.lua",
      "WeakAuras/RegionTypes/RegionPrototype.lua",
      "WeakAuras/WeakAuras.lua",
    ],
    differs: {
      "WeakAuras/SubRegionTypes/SubText.lua": REFACTOR,
      "WeakAuras/SubRegionTypes/Border.lua":
        "Musca adds `border_dispelColor` (colour by dispel type); the renderer draws `border_color` as WeakAuras2 does.",
      "WeakAuras/SubRegionTypes/Tick.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/Glow.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/Texture.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/LinearProgressTexture.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/CircularProgressTexture.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/StopMotion.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/Model.lua":
        "Only the default model id differs (TBC 124614); the placeholder label falls back to it only for a " +
        "document without model_fileId, which both addons fill in on import.",
      "WeakAuras/RegionTypes/RegionPrototype.lua": "Sub-region order and anchoring are the same; Musca walks sub-regions in reverse to remove them.",
      "WeakAuras/WeakAuras.lua": "Anchoring (GetAnchorFrame, AnchorFrame) is the same apart from Musca's native-display anchors and combat deferral.",
    },
  },
  {
    module: "src/render/region-types.ts, src/render/media.ts",
    files: [
      "WeakAuras/Types.lua",
      "WeakAuras/DefaultOptions.lua",
      "WeakAuras/Animations.lua",
      "WeakAuras/SubRegionTypes/SubText.lua",
      "WeakAuras/SubRegionTypes/Glow.lua",
      "WeakAuras/SubRegionTypes/Background.lua",
      "WeakAuras/SubRegionTypes/Tick.lua",
      "WeakAuras/RegionTypes/AuraBar.lua",
    ],
    differs: {
      "WeakAuras/Types.lua": "inverse_point_types, font_flags and the media registrations are the same.",
      "WeakAuras/Animations.lua": "What animations may do per region type is the same.",
      "WeakAuras/SubRegionTypes/SubText.lua": "The sub text defaults per parent and resolveSelfPoint are the same (moved into a helper by Musca).",
      "WeakAuras/SubRegionTypes/Glow.lua": SECRET_ONLY,
      "WeakAuras/SubRegionTypes/Tick.lua": SECRET_ONLY,
      "WeakAuras/RegionTypes/AuraBar.lua": SECRET_ONLY,
    },
  },
  {
    module: "src/render/screen/geometry.ts",
    files: ["WeakAuras/WeakAuras.lua", "WeakAuras/Types.lua"],
    differs: {
      "WeakAuras/WeakAuras.lua": "UI scale and anchor points are the same.",
      "WeakAuras/Types.lua": "frame_strata_types is the same.",
    },
  },
  {
    module: "src/render/group/grow.ts",
    files: ["WeakAuras/RegionTypes/DynamicGroup.lua", "WeakAurasOptions/RegionOptions/DynamicGroup.lua"],
    differs: {
      "WeakAuras/RegionTypes/DynamicGroup.lua":
        "The grow and sort functions are the same; Musca restructures modify() into helpers and defers layout of " +
        "protected frames in combat.",
    },
  },
  {
    module: "src/render/group/layout.ts",
    files: ["WeakAuras/RegionTypes/Group.lua", "WeakAuras/RegionTypes/DynamicGroup.lua", "WeakAuras/WeakAuras.lua"],
    differs: {
      "WeakAuras/RegionTypes/Group.lua":
        "Per game (layout's `game` option): a group's border box. WeakAuras2's GetBoundingRect takes every leaf at its " +
        "own offsets as if it sat directly in the group (a sub group's offset and scale are ignored); Musca's groupRect " +
        "places sub groups with their offsets and scale. Musca's modern aura groups (blizzardFlow) are Forever only.",
      "WeakAuras/RegionTypes/DynamicGroup.lua": "Placement and the border of a dynamic group are the same.",
      "WeakAuras/WeakAuras.lua": "Anchoring children to their group is the same.",
    },
    foreverOnly: ["WeakAuras/SecretAuraAnchor.lua", "WeakAuras/SecretAuraFlow.lua"],
  },
];
