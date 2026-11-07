/** The window's New Aura and Packs pages, as the addon builds them (lua/new-aura.ts). Plain JSON. */
import type { AuraDocument } from "../lua-value";

/** One display type on the window's New Aura page (the addon's registered region options). */
export interface NewAuraType {
  /** regionType of the new aura: icon, aurabar, text, … */
  regionType: string;
  /** The game's name (Icon, Progress Bar, …). */
  displayName: string;
  description?: string;
  /** Texture path of the type's thumbnail, when the type registered one (the others draw theirs with frames). */
  icon?: string;
}

/** A button of the New Aura page that isn't a display type. */
export interface NewAuraButton {
  name: string;
  description: string;
  icon?: string;
}

/**
 * What the window's New Aura page offers, read from the addon (OptionsFrame.lua frame.NewAura). The Modern Aura Group
 * and Packs are Musca Auras' own (Forever); WeakAuras2 (TBC) has neither, so they are absent there.
 */
export interface NewAuraPage {
  /** Display types in the page's order (group and dynamic group first, then by name). */
  types: NewAuraType[];
  /** The Modern Aura Group button: a group made with these settings (Musca Auras only). */
  modernGroup?: NewAuraButton & { sourceData: Record<string, unknown> };
  /** The Packs button, opening `packs()` (Musca Auras only). */
  packs?: NewAuraButton;
  premade: NewAuraButton;
}

/** One pack of the window's Packs page, with its import data as an aura and its descendants. */
export interface AuraPack {
  name: string;
  description: string;
  icon?: string;
  /** The pack's state code, when the addon ships one (utility packs, whole class HUDs). */
  code?: string;
}

export interface AuraPackBlock extends AuraPack {
  label: string;
  /** Import data the addon builds for this block (BuildClassPackBlockImport): the group and its descendants. */
  aura: AuraDocument;
  children: AuraDocument[];
}

export interface AuraPacks {
  utility: (AuraPack & { category?: string })[];
  /** Class HUD packs per class token (DRUID, …): the whole HUD and its blocks. */
  classes: (AuraPack & { class: string; blocks: AuraPackBlock[] })[];
}
