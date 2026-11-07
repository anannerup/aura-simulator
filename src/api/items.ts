/** Wire types of the item API (`/api/<game>/items/*`), shared by the server and the page. No server code here. */

import type { IconSearchHit } from "./files";

/** The item quality names of the game client (`ITEM_QUALITY<n>_DESC`), by `OverallQualityID`. */
export const ITEM_QUALITIES = ["Poor", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Artifact", "Heirloom"] as const;

/** One item of the game client (wago.tools ItemSparse + Item for the game's build). */
export interface Item {
  id: number;
  name: string;
  /** `OverallQualityID` (0 Poor … 7 Heirloom) and its name. */
  quality: number;
  qualityName: string | null;
  itemLevel: number;
  /** Item class and subclass IDs (e.g. 0/5 Consumable/Food & Drink). */
  classId: number | null;
  subclassId: number | null;
  /** The item's icon: FileDataID (what `displayIcon` takes), name (lower case) and path. */
  iconFileId: number | null;
  icon: string | null;
  iconPath: string | null;
  iconUrl: string | null;
  /** The item on Wowhead in the game's environment (`https://www.wowhead.com/tbc/item=6948`). */
  wowhead: string;
}

export interface ItemSearchResult {
  query: string;
  /** The icon the request's `icon` named (the items are those with it); null without `icon`. */
  icon: IconSearchHit | null;
  build: string | null;
  /** The results skipped (the request's `offset`, 0 by default): page with `offset` += `limit` while it is below `total`. */
  offset: number;
  /** The most results answered (the request's `limit`, 1-100; 20 by default). */
  limit: number;
  /** How many items match in all; more than `results.length` when the page cut the list. */
  total: number;
  results: Item[];
}
