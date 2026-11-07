/**
 * The addon's own import decision, inside the addon VM (loaded after options.ts). WeakAuras.Import
 * (Transmission.lua) takes the aura and opens the import dialog (OptionsFrames/Update.lua, `UpdateFrame:Open`); the
 * dialog decides whether it offers Import and says why not (e.g. "This aura was created with a newer version of
 * WeakAuras…", when an aura's internalVersion is above the addon's). Here the real WeakAuras.Import runs, the dialog
 * opens on a stand-in options window, and the answer is whether its Import button is shown, with its last line of text
 * when it isn't. Nothing is added: the dialog's Import button is never clicked.
 */
export const IMPORT_LUA = String.raw`
local O = __options
local P = __shim.private.WeakAuras
local OP = __shim.private.WeakAurasOptions

-- transmit: the table WeakAuras.Import takes besides a string, { d = aura, c = children, v = version, s = sender's
-- addon version }. Without s the aura counts as made by this version (Musca Auras converts ForeverAuras data from
-- any other version).
function O.importCheck(transmit)
  transmit.s = transmit.s or WeakAuras.versionString
  local window = CreateFrame("Frame")
  local dialog
  local saved = { openUpdate = P.OpenUpdate, loadOptions = P.LoadOptions, isOpen = WeakAuras.IsOptionsOpen }
  -- The options are loaded and (as far as Import is concerned) open: ImportNow goes straight to the dialog.
  P.LoadOptions = function() return true end
  WeakAuras.IsOptionsOpen = function() return true end
  P.OpenUpdate = function(data, children, target, linkedAuras, sender, callbackFunc)
    dialog = OP.UpdateFrame(window)
    -- Open shows or hides Import itself; past that decision the dialog compares with installed auras, which may fail
    -- here without changing it.
    dialog.importButton:Show()
    pcall(dialog.Open, dialog, data, children, target, linkedAuras, sender, callbackFunc)
  end
  local ok, result, message = pcall(WeakAuras.Import, transmit)
  P.OpenUpdate, P.LoadOptions, WeakAuras.IsOptionsOpen = saved.openUpdate, saved.loadOptions, saved.isOpen
  if not ok then return { importable = false, message = O.shortError(tostring(result)) } end
  if not dialog then
    return { importable = false, message = type(message) == "string" and message or "The addon did not open its import dialog" }
  end
  local importable = dialog.importButton:IsShown() and true or false
  local text
  if not importable then
    local last = dialog.children and dialog.children[#dialog.children]
    text = last and last.label and last.label:GetText()
  end
  if dialog.ReleaseChildren then pcall(dialog.ReleaseChildren, dialog) end
  return { importable = importable, message = text }
end
`;
