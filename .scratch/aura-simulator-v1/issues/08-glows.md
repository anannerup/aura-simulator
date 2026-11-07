# 08: Glows

**What to build:** All LibCustomGlow styles (button overlay, pixel, autocast shine, proc) animated like the game, using Blizzard textures loaded from wago.tools at runtime. Glows can be switched by conditions.

**Blocked by:** 07 (standalone glow renderer can start immediately)

**Status:** done

- [x] Each glow type renders and animates like the game (compare to LibCustomGlow source)
- [x] Glow options (colour, lines, frequency, length, thickness, scale, offsets) honoured
- [x] Textures fetched at runtime by FileDataID, cached, never committed
- [x] Conditions toggle sub.N.glow
- [x] Completes v1 auras 1 and 2 in the preview

## Progress notes

Standalone renderer: `src/render/glow/` (`<Glow type options width height visible time>`), shared texture
loader `src/render/textures/` (the `/dev/glows` demo page is gone since 2026-11-07: `tests/e2e/glows.spec.ts` pushes
icons with each glow type to the window). Ported from LibCustomGlow-1.0 MINOR 25 as shipped in
Musca Auras 1.15.0 (non-retail paths, since Musca's `isRetail` also requires interface >= 20000).
Pixel and autocast geometry is cross-checked against the Lua itself (`tests/fixtures/lcg/`).

- Proc glow: LibCustomGlow draws it on Forever (the atlases exist in wowf client data, FileDataID 5199404),
  but Musca's `Private.glow_types` doesn't list it, so it can't be picked in the options; only imported auras use it.
- Not modelled: ButtonGlow's half alpha while the parent's `.cooldown` runs > 3 s (the glow sub-region has no
  `.cooldown`, so it never applies to WeakAuras glows); Masque skins.

Integration (with ticket 11): `src/render/subregions/SubGlow.tsx` draws `<Glow>` for each subglow from `state.glows`
(`sub.N.glow` after conditions; glow option properties too), in the sub-region draw order. Default glowType per parent
(Glow.lua:12-32: Pixel on aura bars, button overlay elsewhere); bars glow on `anchor_area` (bar = whole region, icon,
fg = filled part, bg = bar), other regions on the region. The preview region and the mock screen's UI layer avoid
stacking contexts where they can, so ADD-blended glow parts and sparks add onto the screen (and its screenshot) instead
of onto nothing; an aura with its own strata or alpha < 1 is isolated and blends within itself only.
