/** Wire types of the media API (`/api/<game>/media`), shared by the server and the page. No server code here. */

/** LibSharedMedia's types, as the addon's options list them (fonts, bar textures, borders, backgrounds, sounds). */
export const MEDIA_TYPES = ["font", "statusbar", "border", "background", "sound"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export interface MediaEntry {
  /** The name an aura stores (`text_font: "Arial Narrow"`). */
  name: string;
  /** The file it stands for: a game path (`Fonts\ARIALN.TTF`), an addon path or a FileDataID; "" for "None". */
  file: string | number;
  /** Whose it is: the game client's own media or the addon's (`Interface\AddOns\…`). */
  from: "game" | "addon";
}

/**
 * `GET /api/<game>/media[?ref=]`: the media lists of a stock client with only the game's addon (the game's media plus
 * what the addon registers with LibSharedMedia), as the addon's own option lists show them. Names outside them are
 * drawn as the type's default in game (validation warns: `media.<type>`).
 */
export interface MediaLists {
  /** The addon version the lists are from. */
  ref: string;
  /** Per type: the default name (drawn for an unknown name) and every entry, sorted by name. */
  types: Record<MediaType, { default: string | null; entries: MediaEntry[] }>;
  /** A page that draws every font with your sample text: `<url>&text=…&size=…` (a browser or screenshot tool). */
  fontSamples: string;
}

/** Whose a media file is. */
export function mediaFrom(file: string | number): MediaEntry["from"] {
  return typeof file === "string" && /^interface[\\/]+addons[\\/]/i.test(file) ? "addon" : "game";
}
