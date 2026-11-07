/**
 * Musca Auras' own part of the New Aura page (loaded after new-aura.ts, Forever only): the Modern Aura Group button
 * and the Packs page (utility packs and class HUD packs). Official WeakAuras2 has neither.
 */
export const FOREVER_NEW_AURA_LUA = String.raw`
local O = __options
local OP = __shim.private.WeakAurasOptions
local B = __bridge
local translate = O.translate

-- The page's own buttons (frame.NewAura): Packs under Simple, the Modern Aura Group under Advanced (a group with
-- these flow settings).
function O.newAuraExtras(page)
  page.modernGroup = {
    name = translate("Modern Aura Group"),
    description = translate("New group for Aura (Modern) displays: laid out left to right, 2 pixels apart, with the layout kept in combat."),
    sourceData = { blizzardFlow = true, blizzardFlowGrowth = "RIGHT", blizzardFlowSpacing = 2 },
  }
  page.packs = { name = translate("Packs"), description = translate("Ready-made auras for your class, and utility packs"),
    icon = "Interface\\Icons\\INV_Misc_Bag_08" }
end

-- The Packs page (frame.OpenPacks): utility packs, and the class HUD packs (whole HUD and blocks)
-- for every class, each with its import data (a state code, or the block's aura and descendants).
function O.packs()
  O.setup()
  local out = { utility = {}, classes = {} }
  for _, pack in ipairs(OP.utilityPacks) do
    out.utility[#out.utility + 1] = { name = translate(pack.name), description = translate(pack.description),
      category = translate(pack.category), icon = pack.icon, code = type(pack.data) == "string" and pack.data or nil }
  end
  local classes = {}
  for class in pairs(OP.classPacks) do classes[#classes + 1] = class end
  table.sort(classes)
  for _, class in ipairs(classes) do
    local classPack = OP.classPacks[class]
    local entry = { class = class, icon = "Interface\\Icons\\ClassIcon_" .. class, blocks = {},
      name = translate("Whole HUD"),
      description = translate("Full UI pack for your class: rotation, cooldowns, buffs and resources, ready to play"),
      code = type(classPack) == "string" and classPack or nil }
    local blocks = B.try(OP.GetClassPackBlocks, classPack)
    for _, block in ipairs(blocks.ok and blocks.value or {}) do
      local texts = OP.classPackBlockTexts[block.label]
      local data = B.try(OP.BuildClassPackBlockImport, classPack, block.label)
      if data.ok and type(data.value) == "table" then
        entry.blocks[#entry.blocks + 1] = { label = block.label,
          name = texts and translate(texts[1]) or block.label, description = texts and translate(texts[2]) or "",
          aura = B.doc(data.value.d), children = B.doc(data.value.c or {}) }
      end
    end
    out.classes[#out.classes + 1] = entry
  end
  return out
end
`;
