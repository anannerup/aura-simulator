# 11: Bars, text and other elements

**What to build:** Aura bar region, text region, and sub-elements (border, sub-text, tick, background) drawn like the game.

**Blocked by:** 07

**Status:** done

- [x] Aura bar with progress, icon, texts, orientation, textures
- [x] Text region with format codes
- [x] Sub-elements: border, sub-text, tick, background
- [x] Completes v1 aura 3

## Notes

Renderers: `src/render/AuraBarRegion.tsx`, `TextRegion.tsx`, `subregions/` (SubText, Border, Ticks, SubGlow, draw
order in `SubRegions.tsx`), pure maths in `bar-geometry.ts`, LSM names in `media.ts`, game fonts in `fonts.ts`.
`regions.tsx` is the region registry AuraPreview uses; new region types add an entry. Lab examples:
`target-debuff-bar` (v1 aura 3), `ticked-bar`, `vertical-bar`, `cooldown-text`.

- Draw order follows ApplyFrameLevel (WeakAuras.lua:4775): sub-regions by list position; `subbackground` carries
  the region's own textures (icon, bar background), `subforeground` the bar fill, spark and bar icon.
- v1 aura 3 uses Aura (Modern) on the target (bars are a native display type, BlizzardAuraDisplayTrigger.lua:135).
  On bars the Remaining Time window and time-left glows are not available (icon only, SecretAuraSingleStatus.lua:19-43);
  the %p colour rule works in combat.
- Not modelled: smooth progress, overlays/additional bars, the trigger's own inverse flag, the CDM bar, dispel colours on
  borders, `%n` shows the aura's id (not the spell's name), atlas textures, Aura (Modern) rules on a text region's own
  text. Texture, progress texture, stop motion and model sub-regions are ticket 15.
