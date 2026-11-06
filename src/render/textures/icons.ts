/** Where renderers get Blizzard art from. Art is loaded at runtime and never committed. */

const ICON_BASE = "https://wow.zamimg.com/images/wow/icons/large";

/**
 * Icon file names by FileDataID, until the spell cache (ticket 06) supplies them.
 * Unknown IDs fall back to the question mark icon.
 */
const ICON_NAMES: Record<number, string> = {
  134400: "inv_misc_questionmark",
  135932: "spell_holy_magicalsentry",
};

export function iconUrl(fileDataId: number | string | undefined): string {
  const name = (typeof fileDataId === "number" && ICON_NAMES[fileDataId]) || ICON_NAMES[134400];
  return `${ICON_BASE}/${name}.jpg`;
}
