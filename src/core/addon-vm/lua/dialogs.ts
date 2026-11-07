/**
 * The options window's dialogs and the headless window itself, inside the addon VM (loaded after
 * options.ts): buttons that open a dialog record it for the page, which answers with the same button.
 */
export const DIALOGS_LUA = String.raw`
local O = __options
local P = __shim.private.WeakAuras
local OP = __shim.private.WeakAurasOptions
local B = __bridge

---------------------------------------------------------------------------------------------------
-- Dialogs. Some buttons open one of the window's dialogs (icon, texture and model pickers, the code
-- editor). Headless, opening one records what it was opened for; the page shows its own dialog and
-- sends the choice back with the same button, which is then applied the way the dialog's own Pick/
-- Close applies it (IconPicker.lua group.Pick, TexturePicker.lua SetAll, ModelPicker.lua group.Pick,
-- TextEditor.lua group.Close).
---------------------------------------------------------------------------------------------------
O.dialog = nil -- { kind, ... } while a button's func runs

local function leafs(base)
  local out = {}
  for child in P.TraverseLeafsOrAura(base) do out[#out + 1] = child end
  return out
end

local function plainList(t)
  -- category -> { path -> name } (or a function returning it), as the texture picker takes it
  local categories = {}
  for name, category in pairs(t or {}) do
    local cat = type(category) == "function" and select(2, pcall(category)) or category
    if type(cat) == "table" then
      local list = {}
      for path, label in pairs(cat) do
        if type(path) == "string" or type(path) == "number" then
          list[#list + 1] = { tostring(path), type(label) == "string" and label or tostring(path) }
        end
      end
      table.sort(list, function(a, b) return a[2] < b[2] end)
      categories[#categories + 1] = { name = tostring(name), textures = list }
    end
  end
  table.sort(categories, function(a, b) return a.name < b.name end)
  return categories
end

local dialogs = {
  confirm = {
    apply = function(s, value)
      if value == true or value == "accept" then
        if type(s.popup.OnAccept) == "function" then s.popup.OnAccept() end
      elseif type(s.popup.OnCancel) == "function" then
        s.popup.OnCancel()
      end
    end,
  },
  icon = {
    open = function(base, paths, groupIcon)
      local first = groupIcon and base or leafs(base)[1]
      local current = first and paths[first.id] and P.ValueFromPath(first, paths[first.id])
      return { kind = "icon", current = current }, { base = base, paths = paths, groupIcon = groupIcon }
    end,
    apply = function(s, value)
      if s.groupIcon then
        P.ValueToPath(s.base, s.paths[s.base.id], value)
        WeakAuras.Add(s.base)
      else
        for _, child in ipairs(leafs(s.base)) do
          if s.paths[child.id] then
            P.ValueToPath(child, s.paths[child.id], value)
            WeakAuras.Add(child)
          end
        end
      end
    end,
  },
  texture = {
    open = function(base, paths, properties, textures)
      local first = leafs(base)[1]
      local object = first and paths[first.id] and P.ValueFromPath(first, paths[first.id])
      local property = properties and properties.texture
      return { kind = "texture", property = property, current = object and property and object[property],
        categories = plainList(textures) }, { base = base, paths = paths, property = property }
    end,
    apply = function(s, value)
      for _, child in ipairs(leafs(s.base)) do
        local object = s.paths[child.id] and P.ValueFromPath(child, s.paths[child.id])
        if object and s.property then
          object[s.property] = value
          WeakAuras.Add(child)
        end
      end
    end,
  },
  model = {
    open = function(base, path)
      local first = leafs(base)[1]
      local object = first and P.ValueFromPath(first, path)
      return { kind = "model", current = object and object.model_fileId }, { base = base, path = path }
    end,
    apply = function(s, value)
      for _, child in ipairs(leafs(s.base)) do
        local object = P.ValueFromPath(child, s.path)
        if object then
          object.model_fileId = tostring(value)
          WeakAuras.Add(child)
        end
      end
    end,
  },
  text = {
    open = function(data, path, enclose, multipath, reloadOptions, setOnParent, url)
      local current
      if setOnParent then
        current = P.ValueFromPath(data, path)
      else
        for _, child in ipairs(leafs(data)) do
          local p = multipath and path[child.id] or (not multipath and path)
          current = current or (p and P.ValueFromPath(child, p))
        end
      end
      local title
      if not multipath and type(path) == "table" then
        local parts = {}
        for _, field in ipairs(path) do
          parts[#parts + 1] = type(field) == "number" and ("Trigger " .. field) or (tostring(field):gsub("^%l", string.upper))
        end
        title = table.concat(parts, " ")
      end
      return { kind = "text", current = type(current) == "string" and current or "", title = title, url = url,
        lua = enclose ~= nil },
        { data = data, path = path, multipath = multipath, setOnParent = setOnParent }
    end,
    apply = function(s, value)
      if s.setOnParent then
        P.ValueToPath(s.data, s.path, value)
        WeakAuras.Add(s.data)
      else
        for _, child in ipairs(leafs(s.data)) do
          local p = s.multipath and s.path[child.id] or (not s.multipath and s.path)
          if p then
            P.ValueToPath(child, p, value)
            WeakAuras.Add(child)
          end
        end
      end
    end,
  },
}

-- The dialogs the page can't show: the button reports that instead of failing.
local unsupported = {
  OpenTriggerTemplate = "Premade auras (the WeakAurasTemplates addon) aren't available in the simulator",
  OpenCodeReview = "The code review dialog isn't available in the simulator; see the JSON tab",
  ToggleTextReplacements = "text replacements",
  OpenDebugLog = "The debug log isn't available in the simulator",
  ExportToString = "Use Export in the window to get the state code",
  ExportToTable = "Use the JSON tab to see the aura as a table",
  ImportFromString = "Use Import in the window's toolbar",
  OpenUpdate = "Updates from wago.io aren't available in the simulator",
}

function O.installDialogs()
  local opens = { icon = "OpenIconPicker", texture = "OpenTexturePicker", model = "OpenModelPicker", text = "OpenTextEditor" }
  for kind, fnName in pairs(opens) do
    if type(OP[fnName]) == "function" then
      OP[fnName] = function(...)
        local info, state = dialogs[kind].open(...)
        O.dialog = { info = info, state = state, kind = kind }
      end
    end
  end
  for fnName, why in pairs(unsupported) do
    -- (ToggleTextReplacements is only defined once the window exists.)
    if type(OP[fnName]) == "function" or fnName == "ToggleTextReplacements" then
      OP[fnName] = function()
        if fnName == "ToggleTextReplacements" then
          O.dialog = { info = { kind = "textReplacements" }, kind = "textReplacements" }
        else
          O.dialog = { info = { kind = "unsupported", message = why }, kind = "unsupported" }
        end
      end
    end
  end
  -- Confirmation popups (delete a trigger, …): the page asks, and confirms with the same button.
  local show = StaticPopup_Show
  StaticPopup_Show = function(name, ...)
    local popup = StaticPopupDialogs and StaticPopupDialogs[name]
    if type(popup) ~= "table" then return show(name, ...) end
    O.dialog = { kind = "confirm", state = { popup = popup },
      info = { kind = "confirm", text = type(popup.text) == "string" and popup.text or "",
        accept = type(popup.button1) == "string" and popup.button1 or "OK",
        cancel = type(popup.button2) == "string" and popup.button2 or "Cancel" } }
  end
  -- The aura list (display buttons, its search box) doesn't exist headless.
  if type(OP.SortDisplayButtons) == "function" then OP.SortDisplayButtons = function() end end
end

-- A headless options window. Option set()/func() code refreshes the window after an edit
-- (OptionsPrivate.ClearOptions, WeakAuras.ClearAndUpdateOptions, FillOptions, ResetMoverSizer, …
-- all call methods on WeakAurasOptions.lua's file-local 'frame', which is nil until the window is
-- opened). The stand-in has every method (CamelCase key) as a no-op, no fields, and answers the
-- few questions option code asks it.
function O.installWindow()
  local anchor = OP.ClearOptions
  local i = 1
  while true do
    local name, value = debug.getupvalue(anchor, i)
    if not name then return end
    if name == "frame" then
      if value ~= nil then return end
      break
    end
    i = i + 1
  end
  local methods = {
    IsVisible = function() return false end,
    IsShown = function() return false end,
    GetPickedDisplay = function() return O.currentData() end,
    GetTargetAura = function() local d = O.currentData() return d and d.id end,
    -- Like the window: one option table per aura and tab, until the options are cleared.
    EnsureOptions = function(_, data, tab)
      local id = data and data.id
      if id == nil then return nil end
      O.optionCache[id] = O.optionCache[id] or {}
      local cached = O.optionCache[id][tab]
      if cached then return cached end
      local t = O.tabs[tab]
      local fn = t and OP[t.fn]
      if type(fn) ~= "function" then return nil end
      cached = fn(data)
      O.optionCache[id][tab] = cached
      return cached
    end,
    ClearOptions = function(_, id) if id ~= nil then O.optionCache[id] = nil end end,
    ClearAndUpdateOptions = function(_, id) if id ~= nil then O.optionCache[id] = nil end end,
  }
  local noop = function() end
  local window = setmetatable({}, { __index = function(_, k)
    if methods[k] then return methods[k] end
    if type(k) == "string" and k:match("^%u") then return noop end
    return nil
  end })
  debug.setupvalue(anchor, i, window)
end
O.dialogs = dialogs
`;
