# Screenshot test protocol (repeat until it passes)

Picture: scratchpad/shot/consumables.png (wago 6N_i-H6uI screenshot, 12 consumable icons).
Each round: a brand-new agent, same prompt (round 1's prompt verbatim, new out/ folder per round:
out-r<N>/), only the tool's pages and HTTP API, no source code.

Pass = all of:
- result visibly matches the picture (layout, sizes, borders, text above/below, desaturation, overlay)
- validation clean; the tool's own render of the aura used for the comparison
- the agent's "docs/API problems" list has no blocker or significant item (only nits)
- no workarounds outside the documented API (no installing tools, guessing CSS classes, trial-and-error keys)

Round 1 (main 2520b3e): FAIL. See its report; fixes in flight: preview correctness, media+items,
screenshot API, condition reference.

"Works every time" = two consecutive passing rounds on TBC with no code/doc change between them.
Then the same test on WoW Forever (/forever): a Forever picture (a wago aura made for Musca/Forever if one
exists with a screenshot, else the same consumables picture with Forever's own items/spells), same pass
criteria, also two consecutive passes. Forever adds its combat rules: the result must also pass the
combat check, or the agent must explain clearly what the game blocks in combat.

Afterwards (user, 2026-11-07): a refactor round with a fresh code review aimed at naming and idiomatic code
(e.g. the docs file names: llms.txt / agents.md / docs/agents), together with splitting the agent docs into several files.

User rule (2026-11-07): NEVER write custom Lua unless absolutely necessary (slow, brittle, unsafe). Pass criterion added:
the aura has no custom Lua, or the agent shows it is unavoidable with the addon's built-in triggers/conditions.

Correctness reference (user, 2026-11-07): the ORIGINAL aura, wago 6N_i-H6uI (Clickable Consumables [TBC]),
the aura the screenshot was taken of. The test agent never sees it. After each round I compare the agent's
aura with the original:
- picture: both rendered by the tool's screenshot endpoint in the same situation, side by side
- display: group type/grow/spacing, icon size, border size/colours, fonts/sizes/outlines, text anchors/offsets,
  desaturation, the overlay texture
- behaviour: when each icon shows/hides (original: missing or < 5 min left), what the count above shows,
  the labels. The original does this with custom Lua (TSU); the agent's built-in version must behave the same where
  WeakAuras can without Lua, and say plainly where it can't (e.g. clicking to use an item needs secure buttons).

Round 2 (main c94be8e): FAIL, big step. No Lua, within 1-2 px of the screenshot, proportions match the original
(original 36u/size 12/space 5; agent 42u/14/8 = same x1.17, absolute scale is ambiguous from a crop).
Deviations from original: border outside (offset 1 vs 0), no zoom (0.3), 2-3 potion icons wrong (grey screenshot),
always shown (original hides when >5 min left), no glow when active. Tool bugs: border top/bottom missing at
fractional scale; Interface\Cursor\Cast path draws missing; original renders as slivers; inline |T textures not drawn.
Docs/API gaps: scale inference, inside/outside border, point-mode offsets, grow->selfPoint, compare endpoint,
icon search paging/similarity/item-by-icon, shadow vs outline, Item Count at 0.
Fixes in flight: render-bugs agent, docs+compare agent. Then round 3.

Naming round (user, 2026-11-07): "option reference" is terrible naming; it is a table <-> window-text mapping.
Proposed: "table map" (table key <-> window field: label, description, values, default). Rename code, routes
(options.json/options.md -> table-map.*), docs and GLOSSARY in the naming round, with llms.txt/agents.md.
Naming principle (user): domain words a non-coder WeakAuras player understands; no option/handler/engine/
traverser/manager/helper/util. Written into AGENTS.md "## Naming". The naming round reviews the whole codebase against it.

Round 3 (main bdad7a2): FAIL, close. vs original: 35u (36), space 5 ok, border 1/offset 0 ok, PT Sans Narrow Bold 12 ok
but no OUTLINE, zoom 0.1 (0.3), no Lua. Compare 0-1 px. Behaviour: always shown (orig hides >5 min), per-item buffs.
Tool/docs: icons/similar zoom wrong (0.8), index 202 never done, no non-icon texture search, border inside/outside
advice wrong for icons, compare only per display (no per text/element, no text width/x), fonts page browser-only,
docs: desaturate vs elements, edge vs inner anchors, sub.N in condition parts, Item Count "none", rune enchant.
Fix agent running (before Codex refactor starts). Round 4 after Codex refactor.
