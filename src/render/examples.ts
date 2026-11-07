/**
 * Example auras for the agent docs' worked examples (`src/docs/worked-examples.ts`) and the tests: one per trigger
 * kind, region type and combat behaviour, including the four v1 acceptance auras. Plain aura documents, as the addon
 * stores them. The docs and the browser tests push these exact documents to the window, so what the docs teach and
 * what is tested can't drift apart.
 */
import type { AuraDocument, AuraState, LuaObject } from "@/core";

const ICON_BASE = {
  regionType: "icon",
  displayIcon: 135932,
  width: 64,
  height: 64,
  anchorPoint: "CENTER",
  selfPoint: "CENTER",
  xOffset: 0,
  yOffset: 0,
  cooldown: true,
  cooldownTextDisabled: true,
  load: {},
  actions: { start: {}, finish: {}, init: {} },
};

const durationText = (extra: LuaObject = {}): LuaObject => ({
  type: "subtext",
  text_text: "%p",
  text_color: [1, 1, 1, 1],
  text_font: "Friz Quadrata TT",
  text_fontSize: 14,
  text_fontType: "OUTLINE",
  text_visible: true,
  text_justify: "CENTER",
  text_selfPoint: "AUTO",
  anchor_point: "CENTER",
  anchorXOffset: 0,
  anchorYOffset: 0,
  ...extra,
});

const stackText = (): LuaObject => durationText({ text_text: "%s", anchor_point: "INNER_BOTTOMRIGHT", text_fontSize: 12 });

const glow = (on = false): LuaObject => ({ type: "subglow", glow: on, glowType: "buttonOverlay", useGlowColor: false });

const secretTrigger = (extra: LuaObject = {}): LuaObject => ({
  type: "secretAura",
  unit: "player",
  debuffType: "HELPFUL",
  auraspellids: ["1459"],
  secretUseSpellIDs: true,
  useExactSpellId: true,
  nativeFilters: { PLAYER: true },
  ...extra,
});

/**
 * v1 acceptance aura 1a ("my buff is about to expire: desaturate it, show it when less than 3 minutes are left, make it
 * glow as it expires"): the buff's icon, desaturated, shown only while under 3 minutes are left, glowing in its last 30
 * seconds. The trigger's own Remaining Time window (`secretUseRem`, icons only) does the hiding, `desaturate` is a plain
 * display setting, and the glow and the `%p` text turning red under 10 seconds are time rules Aura (Modern) allows, so
 * all of it keeps working in combat. 1b covers the buff once it is gone.
 */
export const buffUnderThreeMinutes: AuraDocument = {
  ...ICON_BASE,
  id: "Arcane Intellect under 3 min",
  desaturate: true,
  subRegions: [durationText(), glow()],
  triggers: {
    "[1]": { trigger: secretTrigger({ secretUseRem: true, secretRemOperator: "<", secretRem: 180 }), untrigger: {} },
    activeTriggerMode: -10,
  },
  conditions: [
    { check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: 30 }, changes: [{ property: "sub.2.glow", value: true }] },
    { check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: 10 }, changes: [{ property: "sub.1.text_color", value: [1, 0, 0, 1] }] },
  ],
};

/** v1 acceptance aura 1b: desaturated and glowing while the buff is missing. */
export const buffMissing: AuraDocument = {
  ...ICON_BASE,
  id: "Arcane Intellect missing",
  subRegions: [glow()],
  triggers: { "[1]": { trigger: secretTrigger({ secretShowOn: "showOnMissing" }), untrigger: {} }, activeTriggerMode: -10 },
  conditions: [
    {
      check: { trigger: 1, variable: "faAuraMissing" },
      changes: [
        { property: "desaturate", value: true },
        { property: "sub.1.glow", value: true },
      ],
    },
  ],
};

/** Not allowed by Aura (Modern): seconds left can't drive desaturation (SecretAuraConditions.lua:489-490). */
export const remainingDesaturates: AuraDocument = {
  ...ICON_BASE,
  id: "Remaining desaturates",
  subRegions: [durationText()],
  triggers: { "[1]": { trigger: secretTrigger(), untrigger: {} }, activeTriggerMode: -10 },
  conditions: [{ check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: 10 }, changes: [{ property: "desaturate", value: true }] }],
};

/** Aura (Modern) with a global "in combat" condition: generic changes hold their pre-combat value. */
export const secretWithCombatCondition: AuraDocument = {
  ...ICON_BASE,
  id: "Secret in combat",
  subRegions: [durationText()],
  triggers: { "[1]": { trigger: secretTrigger(), untrigger: {} }, activeTriggerMode: -10 },
  conditions: [{ check: { trigger: -1, variable: "incombat", value: 1 }, changes: [{ property: "desaturate", value: true }] }],
};

/** v1 acceptance aura 2: a cooldown icon that desaturates while on cooldown. */
export const cooldownIcon: AuraDocument = {
  ...ICON_BASE,
  id: "Fire Blast cooldown",
  displayIcon: 134400,
  cooldownTextDisabled: false,
  subRegions: [stackText()],
  triggers: {
    "[1]": {
      trigger: { type: "spell", event: "Cooldown Progress (Spell)", spellName: 2136, genericShowOn: "showAlways", use_genericShowOn: true },
      untrigger: {},
    },
    activeTriggerMode: -10,
  },
  conditions: [{ check: { trigger: 1, variable: "onCooldown", value: 1 }, changes: [{ property: "desaturate", value: true }] }],
};

/** An old "Aura" (aura2) trigger by spell ID on the target: freezes in combat (padlock). */
export const targetDebuffAura2: AuraDocument = {
  ...ICON_BASE,
  id: "Target debuff",
  inverse: true,
  cooldownEdge: true,
  subRegions: [durationText(), stackText()],
  triggers: {
    "[1]": {
      trigger: { type: "aura2", unit: "target", debuffType: "HARMFUL", useExactSpellId: true, auraspellids: ["116"], ownOnly: true },
      untrigger: {},
    },
    activeTriggerMode: -10,
  },
  conditions: [
    { check: { trigger: 1, variable: "stacks", op: ">=", value: 3 }, changes: [{ property: "color", value: [1, 0.3, 0.3, 1] }] },
    { check: { trigger: 1, variable: "expirationTime", op: "<", value: 5 }, changes: [{ property: "alpha", value: 0.5 }] },
  ],
};

const barText = (text: string, anchor: string, extra: LuaObject = {}): LuaObject => ({
  type: "subtext",
  text_text: text,
  text_color: [1, 1, 1, 1],
  text_font: "Friz Quadrata TT",
  text_fontSize: 12,
  text_fontType: "None",
  text_justify: "CENTER",
  text_visible: true,
  text_selfPoint: "AUTO",
  anchor_point: anchor,
  anchorXOffset: 0,
  anchorYOffset: 0,
  text_shadowColor: [0, 0, 0, 1],
  text_shadowXOffset: 1,
  text_shadowYOffset: -1,
  rotateText: "NONE",
  ...extra,
});

const BAR_BASE = {
  regionType: "aurabar",
  width: 220,
  height: 22,
  anchorPoint: "CENTER",
  selfPoint: "CENTER",
  xOffset: 0,
  yOffset: 0,
  texture: "Blizzard",
  orientation: "HORIZONTAL",
  inverse: false,
  icon: true,
  icon_side: "LEFT",
  barColor: [0.62, 0.22, 0.85, 1],
  backgroundColor: [0, 0, 0, 0.5],
  spark: true,
  load: {},
  actions: { start: {}, finish: {}, init: {} },
};

const playerBuff = (): LuaObject => ({ type: "aura2", unit: "player", debuffType: "HELPFUL", useName: true, auranames: ["Arcane Intellect"] });

/**
 * v1 acceptance aura 3: a debuff's time left on the target as a bar, combat-safe. Aura (Modern) draws bars
 * natively (BlizzardAuraDisplayTrigger.lua:135 REGION_TYPES has aurabar; AuraBarNative.lua follows the game's
 * duration object in combat). Limits on bars: no Remaining Time window (icon only, SecretAuraSingleStatus.lua:42)
 * and no time-left glow (needs an icon, :19-30); the %p text colour rule does work (SecretAuraConditions.lua:657).
 */
export const targetDebuffBar: AuraDocument = {
  ...BAR_BASE,
  id: "Corruption on target",
  displayIcon: 136118,
  subRegions: [{ type: "subbackground" }, { type: "subforeground" }, barText("%n", "INNER_LEFT"), barText("%p", "INNER_RIGHT")],
  triggers: {
    "[1]": { trigger: secretTrigger({ unit: "target", debuffType: "HARMFUL", auraspellids: ["172"] }), untrigger: {} },
    activeTriggerMode: -10,
  },
  conditions: [
    { check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: 5 }, changes: [{ property: "sub.4.text_color", value: [1, 0.2, 0.2, 1] }] },
  ],
};

/** A bar with ticks, a border and a Pixel glow (the bar default) lit by a condition. */
export const tickedBar: AuraDocument = {
  ...BAR_BASE,
  id: "Ticks and border",
  displayIcon: 135932,
  texture: "Solid",
  barColor: [0.2, 0.6, 1, 1],
  backgroundColor: [0.05, 0.05, 0.1, 0.8],
  subRegions: [
    { type: "subbackground" },
    { type: "subforeground" },
    barText("%p", "INNER_RIGHT"),
    {
      type: "subtick",
      tick_visible: true,
      tick_color: [1, 1, 1, 1],
      tick_placement_mode: "AtValue",
      tick_placements: ["10", "30"],
      automatic_length: true,
      tick_thickness: 2,
      tick_length: 30,
      use_texture: false,
      tick_xOffset: 0,
      tick_yOffset: 0,
    },
    { type: "subborder", border_visible: true, border_color: [0, 0, 0, 1], border_edge: "Square Full White", border_offset: 1, border_size: 1, anchor_area: "bar" },
    {
      type: "subglow",
      glow: false,
      glowType: "Pixel",
      useGlowColor: true,
      glowColor: [1, 0.85, 0.2, 1],
      glowLines: 8,
      glowFrequency: 0.25,
      glowLength: 10,
      glowThickness: 2,
      glowXOffset: 0,
      glowYOffset: 0,
      anchor_area: "bar",
    },
  ],
  triggers: { "[1]": { trigger: playerBuff(), untrigger: {} }, activeTriggerMode: -10 },
  conditions: [{ check: { trigger: 1, variable: "expirationTime", op: "<", value: 10 }, changes: [{ property: "sub.6.glow", value: true }] }],
};

/** A vertical bar growing from the bottom (VERTICAL_INVERSE), icon on top, with its time text. */
export const verticalBar: AuraDocument = {
  ...BAR_BASE,
  id: "Vertical",
  width: 24,
  height: 160,
  orientation: "VERTICAL_INVERSE",
  displayIcon: 135932,
  barColor: [0.3, 0.9, 0.3, 1],
  subRegions: [{ type: "subbackground" }, { type: "subforeground" }, barText("%p", "INNER_BOTTOM")],
  triggers: { "[1]": { trigger: playerBuff(), untrigger: {} }, activeTriggerMode: -10 },
  conditions: [],
};

/** A text region with format codes: the aura's name and the cooldown's time left, grey while on cooldown. */
export const cooldownText: AuraDocument = {
  regionType: "text",
  id: "Fire Blast",
  displayText: "%n: %p",
  font: "Friz Quadrata TT",
  fontSize: 24,
  outline: "OUTLINE",
  color: [1, 0.82, 0, 1],
  justify: "LEFT",
  selfPoint: "BOTTOM",
  anchorPoint: "CENTER",
  xOffset: 0,
  yOffset: 0,
  automaticWidth: "Auto",
  shadowColor: [0, 0, 0, 1],
  shadowXOffset: 1,
  shadowYOffset: -1,
  load: {},
  actions: { start: {}, finish: {}, init: {} },
  subRegions: [{ type: "subbackground" }],
  triggers: {
    "[1]": {
      trigger: { type: "spell", event: "Cooldown Progress (Spell)", spellName: 2136, genericShowOn: "showAlways", use_genericShowOn: true },
      untrigger: {},
    },
    activeTriggerMode: -10,
  },
  conditions: [{ check: { trigger: 1, variable: "onCooldown", value: 1 }, changes: [{ property: "color", value: [0.6, 0.6, 0.6, 1] }] }],
};

/**
 * v1 acceptance aura 4: a group holding the other three (four auras: 1a, 1b, 2, 3). The two buff auras share a spot (one
 * shows while under 3 minutes are left, the other while the buff is missing), the cooldown sits to the right and the bar
 * below.
 */
export const v1Group: AuraState = (() => {
  const place = (aura: AuraDocument, xOffset: number, yOffset: number): AuraDocument => ({ ...aura, parent: "v1 auras", xOffset, yOffset });
  const children = [place(buffUnderThreeMinutes, 0, 0), place(buffMissing, 0, 0), place(cooldownIcon, 72, 0), place(targetDebuffBar, 36, -56)];
  return {
    aura: {
      id: "v1 auras",
      regionType: "group",
      anchorPoint: "CENTER",
      selfPoint: "CENTER",
      xOffset: 0,
      yOffset: -200,
      controlledChildren: children.map((c) => c.id as string),
      load: {},
      actions: { start: {}, finish: {}, init: {} },
    },
    children,
  };
})();

const MEDIA = "Interface\\AddOns\\WeakAuras\\Media\\Textures\\";
const REGION_BASE = { anchorPoint: "CENTER", selfPoint: "CENTER", xOffset: 0, yOffset: 0, load: {}, actions: { start: {}, finish: {}, init: {} } };
const buffTrigger = () => ({ "[1]": { trigger: playerBuff(), untrigger: {} }, activeTriggerMode: -10 });
const cooldownTrigger = () => ({
  "[1]": {
    trigger: { type: "spell", event: "Cooldown Progress (Spell)", spellName: 2136, genericShowOn: "showAlways", use_genericShowOn: true },
    untrigger: {},
  },
  activeTriggerMode: -10,
});

/** A texture region: the PowerAuras ring, turned 30° (texcoord rotation, full rotation allowed) and tinted. */
export const textureRegion: AuraDocument = {
  ...REGION_BASE,
  regionType: "texture",
  id: "Texture",
  texture: "Interface\\Addons\\WeakAuras\\PowerAurasMedia\\Auras\\Aura3",
  width: 160,
  height: 160,
  color: [0.4, 0.8, 1, 0.9],
  blendMode: "BLEND",
  rotate: true,
  rotation: 30,
  mirror: false,
  desaturate: false,
  subRegions: [{ type: "subbackground" }],
  triggers: buffTrigger(),
  conditions: [],
};

/** A linear progress texture on a spell cooldown (drawn by the addon's own quads): slanted, horizontal. */
export const progressLinear: AuraDocument = {
  ...REGION_BASE,
  regionType: "progresstexture",
  id: "Linear progress",
  foregroundTexture: `${MEDIA}Square_FullWhite`,
  sameTexture: true,
  width: 240,
  height: 30,
  orientation: "HORIZONTAL",
  inverse: false,
  foregroundColor: [1, 0.6, 0.1, 1],
  backgroundColor: [0.2, 0.2, 0.2, 0.6],
  backgroundOffset: 2,
  slanted: true,
  slant: 0.1,
  slantMode: "INSIDE",
  crop_x: 0.41,
  crop_y: 0.41,
  blendMode: "BLEND",
  subRegions: [{ type: "subbackground" }],
  triggers: cooldownTrigger(),
  conditions: [],
};

/** A circular progress texture (a ring) on a buff: drawn natively from the duration object (ProgressTextureSecret.lua). */
export const progressCircular: AuraDocument = {
  ...REGION_BASE,
  regionType: "progresstexture",
  id: "Circular progress",
  foregroundTexture: `${MEDIA}Ring_20px`,
  sameTexture: true,
  width: 120,
  height: 120,
  orientation: "CLOCKWISE",
  startAngle: 0,
  endAngle: 360,
  inverse: false,
  foregroundColor: [0.3, 1, 0.4, 1],
  backgroundColor: [0.5, 0.5, 0.5, 0.4],
  backgroundOffset: 0,
  crop_x: 0.41,
  crop_y: 0.41,
  auraRotation: 0,
  blendMode: "BLEND",
  subRegions: [{ type: "subbackground" }, durationText({ text_fontSize: 20 })],
  triggers: buffTrigger(),
  conditions: [],
};

/** The addon's example stop motion sheet (Media/Textures/stopmotion, 8×8 frames), looping at 15 frames a second. */
export const stopMotionLoop: AuraDocument = {
  ...REGION_BASE,
  regionType: "stopmotion",
  id: "Stop motion",
  foregroundTexture: `${MEDIA}stopmotion`,
  sameTexture: true,
  width: 128,
  height: 128,
  frameRate: 15,
  animationType: "loop",
  startPercent: 0,
  endPercent: 1,
  inverse: false,
  foregroundColor: [1, 1, 1, 1],
  backgroundColor: [0.5, 0.5, 0.5, 0.5],
  hideBackground: true,
  blendMode: "BLEND",
  subRegions: [{ type: "subbackground" }],
  triggers: buffTrigger(),
  conditions: [],
};

/** Stop motion in "progress" mode: the frame follows the buff's elapsed time. */
export const stopMotionProgress: AuraDocument = {
  ...stopMotionLoop,
  id: "Stop motion progress",
  animationType: "progress",
  hideBackground: false,
  backgroundPercent: 1,
};

/** A model region: drawn as a labelled placeholder. */
export const modelRegion: AuraDocument = {
  ...REGION_BASE,
  regionType: "model",
  id: "Model",
  model_fileId: "122968",
  modelIsUnit: false,
  width: 200,
  height: 200,
  subRegions: [{ type: "subbackground" }],
  triggers: buffTrigger(),
  conditions: [],
};

/** An empty region carrying the texture-like sub-elements: texture, linear/circular progress, stop motion, model, text. */
export const emptyWithElements: AuraDocument = {
  ...REGION_BASE,
  regionType: "empty",
  id: "Empty with elements",
  width: 120,
  height: 120,
  subRegions: [
    { type: "subbackground" },
    { type: "subtexture", textureVisible: true, textureTexture: `${MEDIA}Circle_White`, textureColor: [0.1, 0.1, 0.2, 0.8], anchor_mode: "area", anchor_area: "ALL" },
    {
      type: "subcirculartexture",
      circularTextureVisible: true,
      circularTextureTexture: `${MEDIA}Ring_10px`,
      circularTextureColor: [1, 0.8, 0.2, 1],
      circularTextureStartAngle: 0,
      circularTextureEndAngle: 360,
      circularTextureClockwise: true,
      circularTextureCrop_x: 0.41,
      circularTextureCrop_y: 0.41,
      anchor_mode: "area",
    },
    {
      type: "sublineartexture",
      linearTextureVisible: true,
      linearTextureTexture: `${MEDIA}Square_FullWhite`,
      linearTextureColor: [0.3, 0.7, 1, 1],
      linearTextureOrientation: "HORIZONTAL",
      anchor_mode: "point",
      anchor_point: "BOTTOM",
      self_point: "TOP",
      width: 120,
      height: 8,
      xOffset: 0,
      yOffset: -4,
    },
    {
      type: "substopmotion",
      stopmotionVisible: true,
      stopmotionTexture: `${MEDIA}stopmotion`,
      stopmotionColor: [1, 1, 1, 1],
      animationType: "loop",
      frameRate: 15,
      anchor_mode: "point",
      anchor_point: "CENTER",
      self_point: "CENTER",
      width: 48,
      height: 48,
    },
    { type: "submodel", model_visible: true, model_fileId: "235338", model_alpha: 1, extra_width: 0, extra_height: 0 },
    durationText({ anchor_point: "TOP", text_fontSize: 12 }),
  ],
  triggers: buffTrigger(),
  conditions: [],
};

/**
 * An animated icon: slides in from below and fades in (start, 1 s, ease out), pulses (main preset), and shrinks and
 * fades out (finish, 1 s) when the buff goes. Toggle "Aura present" to see start and finish.
 */
export const animatedIcon: AuraDocument = {
  ...ICON_BASE,
  id: "Animated",
  displayIcon: 135932,
  subRegions: [durationText()],
  triggers: buffTrigger(),
  conditions: [],
  animation: {
    start: { type: "custom", duration_type: "seconds", duration: 1, use_translate: true, x: 0, y: -60, use_alpha: true, alpha: 0, easeType: "easeOut", easeStrength: 3 },
    main: { type: "preset", duration_type: "seconds", preset: "pulse" },
    finish: { type: "custom", duration_type: "seconds", duration: 1, use_scale: true, scalex: 0.2, scaley: 0.2, use_alpha: true, alpha: 0 },
  },
};

/** A texture turning left forever (main preset "Rotate Left": texcoord rotation, 4 s a turn) and fading in. */
export const spinningTexture: AuraDocument = {
  ...textureRegion,
  id: "Spinning texture",
  rotation: 0,
  animation: {
    start: { type: "preset", duration_type: "seconds", preset: "fade" },
    main: { type: "preset", duration_type: "seconds", preset: "rotateCounterClockwise" },
    finish: { type: "preset", duration_type: "seconds", preset: "fade" },
  },
};

export const EXAMPLES: Record<string, AuraDocument> = {
  "buff-under-3-min": buffUnderThreeMinutes,
  "buff-missing": buffMissing,
  "remaining-desaturates": remainingDesaturates,
  "secret-combat-condition": secretWithCombatCondition,
  "cooldown-icon": cooldownIcon,
  "target-debuff": targetDebuffAura2,
  "target-debuff-bar": targetDebuffBar,
  "ticked-bar": tickedBar,
  "vertical-bar": verticalBar,
  "cooldown-text": cooldownText,
  texture: textureRegion,
  "progress-linear": progressLinear,
  "progress-circular": progressCircular,
  "stop-motion": stopMotionLoop,
  "stop-motion-progress": stopMotionProgress,
  model: modelRegion,
  "empty-elements": emptyWithElements,
  "animated-icon": animatedIcon,
  "spinning-texture": spinningTexture,
};
