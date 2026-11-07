/**
 * Wire types of the addon API (`/api/addon/*`), shared by the server and the page. No server code here.
 */

/** Most spell IDs one `/api/addon/spells` request may ask about (the page splits bigger sets). */
export const MAX_CLIENT_SPELL_IDS = 500;

/** One release of the addon. */
export interface AddonRelease {
  /** Normalized version, as jsDelivr lists it: "1.15.0", "1.15.0-beta2". */
  version: string;
  /** The real git tag name: "v1.15.0", "1.13.0". Equals `version` when GitHub couldn't confirm it. */
  tag: string;
  /** Whether `tag` comes from GitHub's tag list (false: a guess, though jsDelivr accepts either spelling). */
  tagConfirmed: boolean;
  /** "-beta1" and the like. */
  prerelease: boolean;
  /** Commit the tag points at, when GitHub reported it. */
  sha?: string;
}

export interface VersionList {
  releases: AddonRelease[];
  /** Tag of the newest stable release: the picker's default. */
  defaultRef: string | null;
  /** Branch names, when GitHub answered. */
  branches: string[];
  /** False when GitHub's tag list was unavailable and tag names are guesses. */
  tagsConfirmed: boolean;
}

/** What a ref the user typed turned out to be. */
export interface Resolution {
  /** What was asked for. */
  input: string;
  kind: "release" | "branch" | "commit";
  /** Immutable ref to fetch with: the real tag name, or a commit SHA. */
  ref: string;
  /** Disk cache directory name (normalized version or commit SHA). */
  key: string;
  /** Normalized version, for releases. */
  version?: string;
  /** Commit SHA, when known. */
  sha?: string;
}

export interface FileListing {
  /** Repo-relative paths with a content hash (git blob SHA or jsDelivr's SHA-256), sorted by path. */
  files: { path: string; hash: string }[];
  source: "github-tree" | "jsdelivr-flat";
  /** False when the source cut the list short (jsDelivr lists at most 1000 files). */
  complete: boolean;
}

/** A region or sub-region type's options: default values and the properties conditions can change. */
export interface OptionTable {
  /** Default option values (top level of the type's `default` table), or null if it has none. */
  defaults: Record<string, unknown> | null;
  /** Names of the type's condition properties, sorted, or null if they couldn't be read. */
  properties: string[] | null;
}

export interface OptionTables {
  regionTypes: Record<string, OptionTable>;
  subRegionTypes: Record<string, OptionTable>;
}

export interface TypeChange {
  /** Region type ("icon") or sub-region type ("subglow"). */
  type: string;
  status: "added" | "removed" | "changed";
  addedOptions: string[];
  removedOptions: string[];
  changedDefaults: { option: string; from: unknown; to: unknown }[];
  addedProperties: string[];
  removedProperties: string[];
}

export interface AddonDiff {
  from: Resolution;
  to: Resolution;
  options: {
    regionTypes: TypeChange[];
    subRegionTypes: TypeChange[];
    /** Why a side's options couldn't be read (its full addon VM didn't load), or null. */
    unreadable: { from: string | null; to: string | null };
  };
  files: {
    added: string[];
    removed: string[];
    changed: string[];
    /** Where the lists came from, and whether they are complete (jsDelivr lists at most 1000 files). */
    source: FileListing["source"][];
    complete: boolean;
  };
  /** CHANGELOG.md sections present in `to` but not in `from` (Markdown), or null. */
  changelog: string | null;
  /** One line per notable change, for the UI. */
  summary: string[];
}
