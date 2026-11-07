# 15: Remaining display types and animations

**What to build:** Texture, progress texture, stop motion and model (placeholder) regions, plus start/main/finish animations in the preview.

**Blocked by:** 07

**Status:** done

- [x] Texture and progress texture (linear/circular)
- [x] Stop motion
- [x] Model shown as a labelled placeholder
- [x] Start/main/finish animations play in the preview

## Notes

- Renderers: `src/render/TextureRegion.tsx`, `ProgressTextureRegion.tsx` (+ `progress-texture.ts`), `StopMotionRegion.tsx`
  (+ `stop-motion.ts`), `ModelRegion.tsx` (model placeholder, empty region), sub-elements in
  `src/render/subregions/SubTextures.tsx`. Shared texcoord maths in `src/render/texture-geometry.ts`, drawing in
  `MappedTexture.tsx`.
- Animations: `src/render/animations.ts` (presets, functions, easing, show/hide lifecycle), played by
  `src/render/AnimatedAuraRegion.tsx` on the game screen (`WorkspaceStage`). (`AuraPreview`, the `/lab` page and its
  Replay button were removed on 2026-11-07.)
- Limits: custom Lua animation functions fall back to the type's normal function; "relative" start/finish animations
  end at once (the preview's timer stands still); atlas textures are labelled, not drawn; wrap modes other than
  CLAMPTOBLACKADDITIVE draw clamped to transparent; the native (Blizzard radial) progress ring is drawn with the
  addon's square-pie wedge.
