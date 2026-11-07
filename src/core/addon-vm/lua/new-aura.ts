/** The window's New Aura page inside the addon VM (loaded after options.ts): display types, new auras and packs. */
export const NEW_AURA_LUA = String.raw`
local O = __options
local P = __shim.private.WeakAuras
local OP = __shim.private.WeakAurasOptions
local B = __bridge
local deepcopy = __extract.deepcopy

---------------------------------------------------------------------------------------------------
-- The New Aura page: display types, new auras and packs, the way the window builds them
---------------------------------------------------------------------------------------------------
local function translate(s)
  if type(s) ~= "string" then return s end
  return WeakAuras.L and rawget(WeakAuras.L, s) or s
end

-- The display types the New Aura page lists (OptionsFrame.lua frame.NewAura): the registered region
-- options, group and dynamic group first, then by display name. icon: a texture path when the type
-- registered one (the others draw their thumbnail with frames).
function O.newAuraTypes()
  O.setup()
  local list = {}
  for regionType, ro in pairs(P.regionOptions) do
    if P.regionTypes[regionType] then
      local entry = { regionType = regionType, displayName = ro.displayName, description = ro.description }
      if type(ro.icon) == "string" then entry.icon = ro.icon end
      list[#list + 1] = entry
    end
  end
  table.sort(list, function(a, b)
    if a.regionType == "group" then return b.regionType ~= "group" end
    if b.regionType == "group" then return false end
    if a.regionType == "dynamicgroup" then return true end
    if b.regionType == "dynamicgroup" then return false end
    return tostring(a.displayName) < tostring(b.displayName)
  end)
  return {
    types = list,
    -- The Modern Aura Group button: a group with these flow settings (frame.NewAura).
    modernGroup = {
      name = translate("Modern Aura Group"),
      description = translate("New group for Aura (Modern) displays: laid out left to right, 2 pixels apart, with the layout kept in combat."),
      sourceData = { blizzardFlow = true, blizzardFlowGrowth = "RIGHT", blizzardFlowSpacing = 2 },
    },
    packs = { name = translate("Packs"), description = translate("Ready-made auras for your class, and utility packs"),
      icon = "Interface\\Icons\\INV_Misc_Bag_08" },
    premade = { name = translate("Premade Auras"), description = translate("Offer a guided way to create auras for your character"),
      icon = "Interface\\Icons\\Inv_misc_book_09" },
  }
end

-- A new aura of regionType, built by WeakAuras.NewAura (data stub, region defaults, default
-- sub elements, Aura (Modern) trigger where supported). The data is taken where NewAura hands it
-- to WeakAuras.Add, so nothing is registered. sourceData: e.g. the Modern Aura Group's flow settings.
function O.newAura(regionType, sourceData)
  O.setup()
  if not P.regionTypes[regionType] then return { ok = false, error = "Unknown display type " .. tostring(regionType) } end
  local captured
  local add = WeakAuras.Add
  WeakAuras.Add = function(data)
    captured = deepcopy(data)
    error("__aurasim_new_aura_captured", 0)
  end
  local r = B.try(WeakAuras.NewAura, sourceData, regionType, nil)
  WeakAuras.Add = add
  if not captured then return { ok = false, error = O.shortError(r.error or "WeakAuras.NewAura made no aura") } end
  return { ok = true, aura = B.doc(captured) }
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
