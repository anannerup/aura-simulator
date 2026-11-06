# 01: First aura end to end

**What to build:** The app runs on localhost. The aura core loads Musca Auras v1.15.0's real Lua (wasmoon-lua5.1, files via jsDelivr) and encodes/decodes state codes with the addon's LibSerialize/LibDeflate. A built-in icon aura is drawn in a basic preview, and Copy gives a plain `!WA:2!` state code.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] App starts on localhost with one command
- [ ] Aura core: document -> state code -> document round trip is lossless
- [ ] Aura core decodes the import strings shipped in the addon (ForeverTutorial) as fixtures
- [ ] Preview draws the built-in icon aura (icon, size, position)
- [ ] Copy button yields a `!WA:2!` string
- [ ] Playwright smoke test: page loads, preview visible, copy yields a state code
- [ ] Player imports the string in game successfully (manual, note result in Comments)
