# 08: Glows

**What to build:** All LibCustomGlow styles (button overlay, pixel, autocast shine, proc) animated like the game, using Blizzard textures loaded from wago.tools at runtime. Glows can be switched by conditions.

**Blocked by:** 07 (standalone glow renderer can start immediately)

**Status:** ready-for-agent

- [ ] Each glow type renders and animates like the game (compare to LibCustomGlow source)
- [ ] Glow options (colour, lines, frequency, length, thickness, scale, offsets) honoured
- [ ] Textures fetched at runtime by FileDataID, cached, never committed
- [ ] Conditions toggle sub.N.glow
- [ ] Completes v1 auras 1 and 2 in the preview
