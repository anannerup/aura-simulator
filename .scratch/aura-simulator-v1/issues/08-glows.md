# 08: Glows

**What to build:** All LibCustomGlow styles (button overlay, pixel, autocast shine, proc) animated like the game, using Blizzard textures loaded from wago.tools at runtime. Glows can be switched by conditions.

**Blocked by:** 07 (standalone glow renderer can start immediately)

**Status:** ready-for-agent (standalone renderer done; condition toggling and preview integration wait for 07)

- [x] Each glow type renders and animates like the game (compare to LibCustomGlow source)
- [x] Glow options (colour, lines, frequency, length, thickness, scale, offsets) honoured
- [x] Textures fetched at runtime by FileDataID, cached, never committed
- [ ] Conditions toggle sub.N.glow
- [ ] Completes v1 auras 1 and 2 in the preview

## Progress notes

Standalone renderer: `src/render/glow/` (`<Glow type options width height visible time>`), shared texture
loader `src/render/textures/`, demo page `/dev/glows`. Ported from LibCustomGlow-1.0 MINOR 25 as shipped in
Musca Auras 1.15.0 (non-retail paths, since Musca's `isRetail` also requires interface >= 20000).
Pixel and autocast geometry is cross-checked against the Lua itself (`tests/fixtures/lcg/`).

- Proc glow: LibCustomGlow draws it on Forever (the atlases exist in wowf client data, FileDataID 5199404),
  but Musca's `Private.glow_types` doesn't list it, so it can't be picked in the options; only imported auras use it.
- Not modelled: ButtonGlow's half alpha while the parent's `.cooldown` runs > 3 s (the glow sub-region has no
  `.cooldown`, so it never applies to WeakAuras glows); Masque skins.

Remaining:
- Conditions toggle `sub.N.glow` (and glow properties) — needs 07; `<Glow visible>` already plays the
  button glow's fade-out (animOut) when switched off.
- Wire into the icon / aura bar renderers and check v1 auras 1 and 2 in the preview.
