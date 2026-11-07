"use client";
/**
 * Game fonts, loaded at runtime through the texture loader (Blizzard fonts from wago.tools by FileDataID, Musca Auras'
 * fonts from its repository; cached like textures) into the page with the FontFace API. Never committed. Until a font
 * has loaded, or if it fails, the text uses a similar web font.
 */
import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import { DEFAULT_ADDON_REF, type LuaValue } from "@/core";
import { rgbaCss } from "./color";
import { DEFAULT_FONT, FONTS } from "./media";
import { textureLoader, textureUrls } from "./textures";

/** The CSS family a game font is registered under. */
const cssFamily = (name: string) => `WoW ${name}`;

function fontName(value: LuaValue | undefined): string {
  return typeof value === "string" && value !== "" ? value : DEFAULT_FONT;
}

/**
 * CSS font-family for an LSM font name: the game font, its look-alike, then the default game font (WoW falls back
 * to STANDARD_TEXT_FONT when a font can't be set, TextStyle.lua:43).
 */
export function fontFamily(value: LuaValue | undefined): string {
  const name = fontName(value);
  const file = FONTS[name] ?? FONTS[DEFAULT_FONT];
  const families = [`"${cssFamily(name in FONTS ? name : DEFAULT_FONT)}"`, file.fallback];
  if (name !== DEFAULT_FONT) families.push(`"${cssFamily(DEFAULT_FONT)}"`, FONTS[DEFAULT_FONT].fallback);
  return families.join(", ");
}

/** Where a game file (font, sound) is downloaded from: a FileDataID or an `Interface\\AddOns\\…` path. */
export function fontUrl(source: number | string, addonRef = DEFAULT_ADDON_REF): string {
  return textureUrls(source, addonRef)[0];
}

type Status = "loading" | "loaded" | "failed";
const status = new Map<string, Status>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Starts loading a game font once per page. Unknown names load the default font. */
export function ensureFont(value: LuaValue | undefined): void {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;
  const name = fontName(value) in FONTS ? fontName(value) : DEFAULT_FONT;
  if (status.has(name)) return;
  status.set(name, "loading");
  const file = FONTS[name];
  textureLoader()
    .loadBytes(file.source)
    .then((bytes) => new FontFace(cssFamily(name), bytes as Uint8Array<ArrayBuffer>).load())
    .then((face) => {
      document.fonts.add(face);
      status.set(name, "loaded");
      notify();
    })
    .catch((err) => {
      status.set(name, "failed");
      notify();
      console.warn("font load failed", name, err);
    });
}

/** Loads the font and returns its CSS family; re-renders when it has loaded (or failed). */
export function useWowFont(value: LuaValue | undefined): { family: string; status: Status } {
  const name = fontName(value) in FONTS ? fontName(value) : DEFAULT_FONT;
  useEffect(() => ensureFont(name), [name]);
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status.get(name) ?? "loading",
    () => "loading" as Status,
  );
  return { family: fontFamily(value), status: current };
}

/**
 * A font string's width as CSS: sized by its text ("Auto"), or `width` wide (Fixed) with word wrap or an ellipsis
 * (Elide).
 */
export function textWidthStyle(width: number | undefined, wordWrap: LuaValue | undefined): CSSProperties {
  if (width === undefined) return { whiteSpace: "pre" };
  const wrap = wordWrap !== "Elide";
  return wrap
    ? { width, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }
    : { width, whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" };
}

/**
 * Font flags as CSS (Types.lua:1510 font_flags, TextStyle.lua:21-44): OUTLINE draws a 1 px black outline,
 * THICKOUTLINE a 2 px one (eight offset copies, which is close to the game's rasterised outline); MONOCHROME
 * turns anti-aliasing off. The font's drop shadow (shadowColor, x/y offset, y up) is drawn in every mode except
 * the SLUG outlines, which draw their own.
 */
export function fontFlagsStyle(flags: LuaValue | undefined, shadow: { color: readonly number[]; x: number; y: number }): CSSProperties {
  const f = typeof flags === "string" ? flags : "None";
  const shadows: string[] = [];
  const outline = f.includes("THICKOUTLINE") ? 2 : f.includes("OUTLINE") ? 1 : 0;
  if (outline) {
    const w = outline;
    for (const [dx, dy] of [[-w, 0], [w, 0], [0, -w], [0, w], [-w, -w], [w, w], [-w, w], [w, -w]]) shadows.push(`${dx}px ${dy}px 0 #000`);
  }
  const shadowless = f === "OUTLINE|SLUG" || f === "THICKOUTLINE|SLUG";
  if (!shadowless && (shadow.x !== 0 || shadow.y !== 0)) {
    shadows.push(`${shadow.x}px ${-shadow.y}px 0 ${rgbaCss(shadow.color)}`);
  }
  const style: CSSProperties = { textShadow: shadows.join(", ") || undefined };
  if (f.includes("MONOCHROME")) {
    style.WebkitFontSmoothing = "none";
    style.fontSmooth = "never";
  }
  return style;
}
