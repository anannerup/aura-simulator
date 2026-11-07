/**
 * The window's New Aura page inside the addon VM (loaded after options.ts): display types and new auras, which every
 * WeakAuras has. A game's own buttons and pages come after it (Forever: lua/new-aura-forever.ts, defining
 * `O.newAuraExtras` and `O.packs`).
 */
export const NEW_AURA_LUA = String.raw`
local O = __options
local P = __shim.private.WeakAuras
local B = __bridge
local deepcopy = __extract.deepcopy

---------------------------------------------------------------------------------------------------
-- The New Aura page: display types and new auras, the way the window builds them
---------------------------------------------------------------------------------------------------
function O.translate(s)
  if type(s) ~= "string" then return s end
  return WeakAuras.L and rawget(WeakAuras.L, s) or s
end
local translate = O.translate

-- The display types the New Aura page lists (OptionsFrame.lua frame.NewAura): the registered region
-- options, group and dynamic group first, then by display name. icon: a texture path when the type
-- registered one (the others draw their thumbnail with frames). Premade Auras is the Simple section's button
-- in every WeakAuras (WeakAurasTemplates); a game's own buttons are added by O.newAuraExtras.
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
  local page = {
    types = list,
    premade = { name = translate("Premade Auras"), description = translate("Offer a guided way to create auras for your character"),
      icon = "Interface\\Icons\\Inv_misc_book_09" },
  }
  if O.newAuraExtras then O.newAuraExtras(page) end
  return page
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
`;
