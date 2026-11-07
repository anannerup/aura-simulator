/**
 * Musca Auras' part of the core's entry points (loaded after lua/extract.ts): Aura (Modern) registries and
 * validation (BlizzardAuraDisplay, SecretAuraConditions.lua's file-local tables) and the combat warnings
 * (TriggerSecretWarnings). Every addon internal used here is in the Forever contract (contract.ts).
 */
export const FOREVER_EXTRACT_LUA = String.raw`
local X = __extract
local P = __shim.private.WeakAuras
local OP = __shim.private.WeakAurasOptions
local deepcopy, safe, listOf, stripColor, segments = X.deepcopy, X.safe, X.listOf, X.stripColor, X.segments

function X.upvalueRoots()
  return { P.BlizzardAuraDisplay, P.AuraSingleShared, P.AuraDisplayShared }
end

-- Registries: Aura (Modern)'s tables.
X.registryParts[#X.registryParts + 1] = function(R, regionNames)
  local D = P.BlizzardAuraDisplay
  R.secretAura = {
    units = D.units, nativeFilters = D.nativeFilters, showOnValues = D.showOnValues,
    singleUnits = D.singleUnits, missingTypes = D.missingTypes,
    remOperators = D.remOperators, stackOperators = D.stackOperators,
    STACK_LIMIT = D.STACK_LIMIT, missingRootProperties = D.missingRootProperties,
    supportedRegionTypes = {},
    supportsDurationColorCondition = D.SupportsDurationColorCondition(),
  }
  for _, rn in ipairs(regionNames) do
    if D.SupportsRegionType(rn) then table.insert(R.secretAura.supportedRegionTypes, rn) end
  end
  for _, localName in ipairs({ "VARIABLES", "ROOT_PROPERTIES", "ELEMENT_PROPERTIES", "HIGHLIGHT_SET" }) do
    R.secretAura[localName] = X.findUpvalue(localName, X.upvalueRoots())
  end
end

-- Index of the trigger Aura (Modern) shows (its progress source).
local function sourceTriggerIndex(data)
  local D = P.BlizzardAuraDisplay
  local source = D.GetSavedTrigger(data)
  if not source then return nil end
  for i, entry in ipairs(data.triggers or {}) do
    if entry.trigger == source then return i end
  end
end

local function validateMessage(data)
  local message = safe(P.BlizzardAuraDisplay.Validate, data)
  return message
end

-- Which part of the aura causes 'message'? Tries the aura without parts of it and looks for the
-- part whose removal makes the message go away. Returns a blame table (indexes into 'data').
local function blame(data, message)
  local D = P.BlizzardAuraDisplay
  local conditions = listOf(data.conditions)
  if #conditions > 0 and safe(D.ValidateConditions, data) == message then
    -- First condition whose prefix already shows the message.
    for i = 1, #conditions do
      local copy = deepcopy(data)
      copy.conditions = {}
      for k = 1, i do copy.conditions[k] = deepcopy(conditions[k]) end
      if safe(D.ValidateConditions, copy) == message then
        local condition = conditions[i]
        local changes = listOf(condition.changes)
        for j, change in ipairs(changes) do
          if change.property ~= nil and not safe(D.NativeConditionAllowsProperty, data, condition.check, change.property) then
            return { kind = "change", condition = i, change = j, property = change.property, propertyAllowed = false }
          end
        end
        for j = 1, #changes do
          local c2 = deepcopy(copy)
          c2.conditions[i].changes = {}
          for k = 1, j do c2.conditions[i].changes[k] = deepcopy(changes[k]) end
          if safe(D.ValidateConditions, c2) == message then
            return { kind = "change", condition = i, change = j, property = changes[j].property }
          end
        end
        return { kind = "condition", condition = i }
      end
    end
    return { kind = "conditions" }
  end
  local without = deepcopy(data)
  without.actions = nil
  if data.actions and validateMessage(without) ~= message then return { kind = "actions" } end
  without = deepcopy(data)
  without.animation = nil
  if data.animation and validateMessage(without) ~= message then return { kind = "animation" } end
  local appearance = safe(D.ValidateAppearance, safe(D.PrepareConditionAppearance, data) or data)
  if appearance == message then return { kind = "display" } end
  if data.regionType == "progresstexture" then
    without = deepcopy(data)
    without.orientation = "HORIZONTAL"
    if validateMessage(without) ~= message then return { kind = "display", property = "orientation" } end
  end
  return { kind = "trigger", trigger = sourceTriggerIndex(data) }
end

-- Removes the blamed change or condition so the next problem can be found. Returns false when the
-- blamed part can't be taken out (trigger, display, actions).
local function removeBlamed(data, b, map)
  if b.kind == "change" then
    table.remove(data.conditions[b.condition].changes, b.change)
    table.remove(map.changes[b.condition], b.change)
    return true
  elseif b.kind == "condition" then
    table.remove(data.conditions, b.condition)
    table.remove(map.conditions, b.condition)
    table.remove(map.changes, b.condition)
    return true
  end
  return false
end

-- All Aura (Modern) problems, first to last, each with the option that causes it.
local function modernProblems(data)
  local work = deepcopy(data)
  local map = { conditions = {}, changes = {} }
  for i, condition in ipairs(listOf(work.conditions)) do
    map.conditions[i] = i
    map.changes[i] = {}
    for j in ipairs(listOf(condition.changes)) do map.changes[i][j] = j end
  end
  local problems = {}
  for _ = 1, 20 do
    local message = validateMessage(work)
    if not message then break end
    local b = blame(work, message)
    local entry = { message = message, kind = b.kind, trigger = b.trigger, property = b.property,
      propertyAllowed = b.propertyAllowed }
    if b.condition then
      entry.condition = map.conditions[b.condition]
      if b.change then entry.change = map.changes[b.condition][b.change] end
    end
    problems[#problems + 1] = entry
    if not removeBlamed(work, b, map) then break end
  end
  return problems
end

-- Warnings the options addon shows when the game hides values of a classic trigger in combat
-- (TriggerSecretWarnings), asked per trigger with the client profile in combat.
local function combatTriggerWarnings(data)
  local W = OP and OP.TriggerSecretWarnings
  local out = {}
  if not W then return out end
  OP.Private = OP.Private or P
  __profile.combat = true
  for i, entry in ipairs(listOf(data.triggers)) do
    local trigger = type(entry) == "table" and entry.trigger
    if type(trigger) == "table" and trigger.type ~= "secretAura" then
      local secretSpell = safe(W.HasSecretAuraSpell, trigger) and true or false
      -- The scope logic reads trigger.event; only ask it when that event belongs to the trigger's
      -- type. (Every trigger carries the data_stub's event = "Health", also aura and item triggers.)
      local proto = trigger.event and P.event_prototypes[trigger.event]
      local scope
      if trigger.type == "custom" or (proto and proto.type == trigger.type) then
        scope = safe(W.GetScope, data, i)
      end
      if secretSpell or scope then
        out[#out + 1] = { trigger = i, triggerType = trigger.type, secretSpell = secretSpell,
          scope = scope, message = stripColor(W.message),
          casterOnly = scope ~= nil and scope == WeakAuras.L["Caster unit checks:"],
          casterMessage = stripColor(W.casterText) }
      end
    end
  end
  __profile.combat = false
  return out
end

X.validateParts[#X.validateParts + 1] = function(data, res)
  local D = P.BlizzardAuraDisplay
  res.hasModernTrigger = safe(D.HasTrigger, data) and true or false
  res.eligible = safe(D.Eligible, data) and true or false
  if res.eligible then
    res.sourceTrigger = sourceTriggerIndex(data)
    res.problems = modernProblems(data)
    local trigger = D.GetTrigger(data)
    local status, err = safe(D.TriggerStatus, data, trigger)
    res.status = status and stripColor(status) or nil
    res.statusError = err
    res.statusSegments = status and segments(status) or {}
  elseif res.hasModernTrigger and data.regionType ~= "group" and data.regionType ~= "dynamicgroup" then
    res.notEligible = validateMessage(data)
    res.regionSupported = D.SupportsRegionType(data.regionType) and true or false
  end
  res.combatTriggers = combatTriggerWarnings(data)
end
`;
