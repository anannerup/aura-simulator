/**
 * The addon files the situation and condition modules restate (`situation/`, `conditions/`), pinned by content.
 * `mirrored.test.ts` fails when any of them differs at `ref`, or when `ref` is not the app's default addon version:
 * on an addon update, re-check the rules that cite the changed files, then record the new hashes and ref.
 */
export const MIRRORED: { ref: string; files: Record<string, string> } = {
  ref: "v1.15.0",
  /** Path in the addon repository → first 16 hex digits of the file's SHA-256. */
  files: {
    "WeakAuras/BuffTrigger2.lua": "a5284094c8e9fccd",
    "WeakAuras/BuffTriggerNativeFilter.lua": "4778f3b5c233b9e7",
    "WeakAuras/Conditions.lua": "980aace96da09133",
    "WeakAuras/FrozenMarker.lua": "3cbffc85c88c243d",
    "WeakAuras/Prototypes.lua": "f52d5f38d9056417",
    "WeakAuras/SecretAuraAppearance.lua": "7c9392282adbff3f",
    "WeakAuras/SecretAuraConditions.lua": "6fe9f55f75a0a6e0",
    "WeakAuras/SecretAuraSingleGates.lua": "f57747fff5db47ce",
    "WeakAuras/SecretAuraSingle.lua": "c13509b0c1f0a5d4",
    "WeakAuras/WeakAuras.lua": "f231f6547faac787",
    "WeakAuras/RegionTypes/AuraBar.lua": "836e968af6add741",
    "WeakAuras/RegionTypes/Icon.lua": "0143dbceda5c44e4",
    "WeakAuras/RegionTypes/ProgressTexture.lua": "aeece6dbd4a45851",
    "WeakAuras/RegionTypes/StopMotion.lua": "57396950edabb7ac",
    "WeakAuras/RegionTypes/Text.lua": "9003d4be072d2127",
    "WeakAuras/RegionTypes/Texture.lua": "16e428320db61d7d",
    "WeakAuras/SubRegionTypes/SubText.lua": "550708d778c8db5f",
    "WeakAuras/SubRegionTypes/Glow.lua": "9db35e283939470f",
    "WeakAuras/SubRegionTypes/Border.lua": "0ccb4fa154c13f88",
    "WeakAuras/SubRegionTypes/Tick.lua": "64cf70b30aada5ee",
    "WeakAuras/SubRegionTypes/Texture.lua": "44a149682bf78300",
    "WeakAuras/SubRegionTypes/LinearProgressTexture.lua": "26a26a1c3bb1a449",
    "WeakAuras/SubRegionTypes/CircularProgressTexture.lua": "a005a3278a6bd775",
    "WeakAuras/SubRegionTypes/StopMotion.lua": "de24dc0b487b8975",
    "WeakAuras/SubRegionTypes/Model.lua": "946843ce7cd3e824",
  },
};
