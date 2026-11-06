# 01: First aura end to end

**What to build:** The app runs on localhost. The aura core loads Musca Auras v1.15.0's real Lua (wasmoon-lua5.1, files via jsDelivr) and encodes/decodes state codes with the addon's LibSerialize/LibDeflate. A built-in icon aura is drawn in a basic preview, and Copy gives a plain `!WA:2!` state code.

**Blocked by:** None (can start immediately)

**Status:** done (only the in-game import check is left)

- [x] App starts on localhost with one command
- [x] Aura core: document -> state code -> document round trip is lossless
- [x] Aura core decodes the import strings shipped in the addon (ForeverTutorial) as fixtures
- [x] Preview draws the built-in icon aura (icon, size, position)
- [x] Copy button yields a `!WA:2!` string
- [x] Playwright smoke test: page loads, preview visible, copy yields a state code
- [x] Player imports the string in game successfully (manual, note result in Comments)

## Comments

- Agent: implemented. The three ForeverTutorial import strings in v1.15.0 are plain (not Musca-encrypted) and serve as
  fixtures, read from the addon source at test time. Decoding runs the addon's own `StringToTable` from
  Transmission.lua, which also accepts Musca-encrypted exports because it tries decryption first; encoding writes
  plain strings only. The document model is described in `src/core/lua-value.ts`. Waiting on the in-game import of the
  sample aura's state code.

- 2026-11-06: Player imported the sample state code in WoW Forever (Musca Auras 1.15.0). The icon shows at screen centre while Arcane Intellect is up, with the time-left text ("39m"). Encoding outside the game is confirmed.
