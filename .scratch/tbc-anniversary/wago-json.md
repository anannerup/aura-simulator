# Research: the JSON document wago.io shows for a WeakAura

Researched 2026-11-07. Primary sources:
- wago.io source, github.com/methodgg/wago.io at `944376a` (2026-11-05). The repo's own `AGENTS.md` calls it
  "the current Wago v3 web application".
- The user's own aura https://wago.io/LEPRolmHn ("Eye buff missing", TBC, v1.0.0), fetched from wago's data API.
- Our decoder (`loadAddon("v1.15.0")` → `core.decode`), run in Node through vitest with a config in the scratchpad.
  No repo files were changed.

"Verified" means I checked it against the real sample or a local run. "Read" means I read the source but couldn't
run it: the classifier blocked running wago's Lua (`json.lua`, `wago.lua`) locally, so I ported it to JS.

## TL;DR (decisive facts)

1. **What wago shows.** Open the aura page, then the **"Editor"** button, then the **"Table data"** entry of the
   "Edit …" dropdown. The page shows a Monaco JSON editor. It holds `JSON.stringify(JSON.parse(code.json), null, 2)`
   of the **whole transmit table** `{c?, d, m, s, v, wagoID}`. Children of a group are in `c` (an array). There is
   no JSON download button. The same JSON (compact, as a string) comes from
   `GET https://data.wago.io/lookup/wago/code?id=<id>` in the response's `json` field.
2. **Byte-for-byte reproduction works.** I wrote a JS port of wago's pipeline. I fed it the table our core decodes
   from LEPRolmHn's import string, with wago's id, url and version stamp. The compact output matched wago's stored
   `json` **exactly**: 2521 of 2521 bytes. The 2-space version matched the Editor text exactly. LEPRolmHn's `d`
   already carries `wagoID/url/version/semver`, so the stamp isn't needed for it: setting the top-level `wagoID`
   from `d.wagoID` alone also gives the identical bytes.
3. **Key order is deterministic and doesn't depend on Lua's hash order.** wago re-sorts every object in JS
   (`sortJSON` in `WeakAura.js`) after Lua has encoded it. The result: integer-like keys (`"1"`, `"2"`, …) come first
   in ascending numeric order, because the JS engine always enumerates them first. All other keys follow, sorted by
   UTF-16 code unit (`<`). Hash order can only show through in pathological tables that hold both the string key
   `"n"` and the number key `n` (details in §2). WeakAuras data doesn't produce such tables.
4. **The format is lossy and one-way.** Lua number keys become JSON string keys. Mixed tables like `triggers` come
   out as `{"1": …, "2": …, "activeTriggerMode": -10, "disjunctive": "all"}`. Empty tables become `[]`. Numbers are
   cut to **14 significant digits** (LuaJIT `tostring` = `%.14g`). NaN and ±inf become `null`. A table with a
   boolean key makes wago's encoder throw, so such an aura can't be imported on wago at all. The JSON can't be
   turned back into the exact Lua table, but we only need the other direction (our document → wago JSON), which
   is a pure function.
5. **wago re-encodes the import string from this JSON.** The `!WA:2!` string wago serves (Copy, `api/raw/encoded`)
   is **not the uploaded string**. It's rebuilt from the JSON: decoded in Lua, with number keys restored only along
   a hard-coded list of paths, then LibSerialize, then LibDeflate level 9. So a wago string decodes to the uploader's
   table plus wago's fields, with floats cut to 14 digits and `{}` everywhere an empty table was.
6. **Pasting JSON back.** wago itself can turn edited JSON into a string. The Editor's "Export/Fork changes" does
   `POST /import/json/scan` and returns `encoded`; "Save changes" (owner only) does `POST /import/json/save`. The
   main import box only accepts strings. WeakAuras in game only accepts `!WA:` strings, never JSON.

## 1. Where the JSON comes from (code path)

Import (`backend/api/services/import.js` `ScanImport`): `wowAddons.toDecodedObject` has no `!WA:` adapter. So
`encode-decode/WeakAura.js` `decode` runs a Lua snippet under **LuaJIT**. The snippet uses
`LibDeflate:DecodeForPrint` → `DecompressDeflate` → `LibSerialize:Deserialize` → **`JSON:encode(deserialized)`**.
`backend/api/helpers/lua.js` writes the snippet after `api/lua/wago.lua` and runs it with `execa('luajit', [file])`.
Node reads stdout as UTF-8. `JSON` is `api/lua/json.lua`, Jeffrey Friedl's JSON.lua 20141223.14, **modified by wago**
(see `object_or_array`). Then `scan.decoded = JSON.stringify(decodedObj)` and `code.json = scan.decoded`.

The background job `ProcessCode` (`backend/api/helpers/tasks.js`) then calls `WeakAura.js` `addWagoData`. It:
- sets the top-level `json.wagoID`
- sets `wagoID`, `url = <wago url>/<iteration>`, `version = <iteration>` and `semver = <versionString>` on `d` and
  on every `c[i]`
- deletes `ignoreWagoUpdate` and `skipWagoUpdate`
- fills a missing `d.tocversion` from the upload date
- stores `code.json = JSON.stringify(sortJSON(json))`, compact
- calls `encode` to rebuild `code.encoded` from that JSON

Serving: `backend/api/services/lookup.js` `/lookup/wago/code` returns `{alerts, json, encoded, version,
versionString, changelog, customCode, tableMetrics}`. `json` is the stored string verbatim.

Frontend: `frontend/src/components/core/ViewWago.vue` ~l.2290 does `code.json = JSON.stringify(JSON.parse(code.json),
null, 2)`. `frontend/src/components/UI/EditWeakAura.vue` shows that in `monaco-editor` with `lang json`. When the
user switches back to "Table data" it shows `JSON.stringify(this.tableData, null, 2)` again.

Data API (verified, 2026-11-07, sent with `Origin: https://wago.io`):
- `https://data.wago.io/lookup/wago?id=LEPRolmHn` gives the metadata: `type: "TBC-WEAKAURA"`, `game: "tbc"`,
  `regionType`, ….
- `https://data.wago.io/lookup/wago/code?id=LEPRolmHn` redirects to `…&version=1.0.0`. The response has `json`
  and `encoded`.
- `https://data.wago.io/api/raw/encoded?id=LEPRolmHn` gives the `!WA:2!` string as text/plain. It equals the
  `encoded` field above (verified).

## 2. Exact formatting rules (from a decoded Lua table to wago's bytes)

Stage A, Lua → JSON text (`json.lua` `object_or_array` + `encode_value`, read), then `JSON.parse` in Node:

| Lua value | wago JSON |
|---|---|
| string | JSON string. Invalid UTF-8 bytes become U+FFFD when Node decodes stdout (Node default; not tested). |
| number | `tostring(n)` = C `%.14g` with round-half-to-even (LuaJIT 2.1 checked locally: `0.1+0.2`→`0.3`, `123456789012345`→`1.2345678901234e+14`, `2^53-1`→`9.007199254741e+15`, `-0`→`-0`). Node then re-parses it, so in the final text only the **value** counts. |
| NaN | `null` |
| ±inf | `1e+9999` → parses as `Infinity` → `JSON.stringify` writes `null` |
| boolean | `true`/`false` |
| function | `"<function>"` (WeakAuras data has none) |
| empty table | `[]` (never `{}`) |
| table whose keys are **all numbers in (0, 1000]** | **array** of length `max key`, item i = `t[i]`, holes = `null`. Sparse tables become null-padded arrays. A non-integer key k makes the length `floor(k)` and drops that entry (e.g. `{[0.5]=x}` → `[]`). |
| any other table (a string key, or a number key ≤ 0 or > 1000) | **object**. String keys stay as they are. Number keys become `tostring(key)` (`%.14g`). So a Lua sequence longer than 1000 becomes an object `{"1":…, …}`. |
| table with a **boolean key** | Lua error (`nil > 1000` in `object_or_array`), so the import fails (read; not run) |

Collisions (read): in a mixed table, a number key whose string form is already a real string key is bumped to the
next free integer string (`n+1`, `n+2`, …). Keys > 1000, and keys ≤ 0 seen after the first such key, skip that
check. If they collide with a real string key, `JSON.parse` gets duplicate keys and keeps the last one, whose
position depends on Lua `pairs` order. **This is the only place hash order can leak into the output.** It needs both
`"n"` and `n` in one table, which WeakAuras doesn't produce.

Stage B, `addWagoData` (JS):
- top level: `wagoID`
- `d` and each `c[i]`: `wagoID`, `url`, `version`, `semver`
- delete `ignoreWagoUpdate` and `skipWagoUpdate`
- `sortJSON`: every object recursively; arrays keep their order but their elements are sorted. Keys sort with
  `a < b` (UTF-16 code units: uppercase before `_` before lowercase, e.g. `anchorYOffset` < `anchor_point`). The
  resulting object enumerates canonical array-index keys (`"0"`…`"4294967294"`) first, in numeric order, then the
  rest in sorted order. `"-10"`, `"1.5"` and `"01"` are not index keys and sort as strings.

Stage C, text:
- **Stored / API**: `JSON.stringify(obj)`, compact, no newline.
- **Editor**: `JSON.stringify(obj, null, 2)`, which means:
  - 2-space indent, `"key": value`, LF line endings, no trailing newline
  - every array element on its own line, also arrays of numbers (e.g. `"color": [` / `1,` …)
  - empty arrays `[]`
  - `-0` → `0`, numbers in JS shortest form (`1e21` and up, and below `1e-6`, in exponent form, e.g. `1e-7`)
  - strings escape only `"`, `\` and control characters (`\b \f \n \r \t`, others `\u00XX` lowercase); `/` and
    non-ASCII stay literal (lone surrogates `\udXXX`)
- Top level: `{"c"?, "d", "m": "d", "s": "<sender WA version>", "v": 1421, "wagoID"}`. WeakAuras writes
  `m = "d"` itself: `WeakAuras/Transmission.lua:459` and `WeakAurasOptions/PackLibrary.lua:217`. Our decoder doesn't
  expose `m`, but it's always `"d"`.

"Identical" therefore means: **reproducible from the import string alone, except for wago's stamp**. `wagoID`,
`url`, `version` and `semver` come from wago's database (`/lookup/wago` → `_id`, `url`; `/lookup/wago/code` →
`version` iteration, `versionString`). An aura imported from wago, like LEPRolmHn, already carries all four in `d`.
WeakAuras keeps them as "metadata" (`WeakAuras/Types.lua` ~l.3580, `url/desc/version/semver/wagoID`), so its JSON is
reproducible byte for byte from the string. Only the top-level `wagoID` (= `d.wagoID`) needs adding. An aura never
uploaded has no wago JSON to match. Our output would be wago's format without the stamp.

The one exactness caveat for us: **`%.14g` ties**. JS `toPrecision(14)` rounds exact ties half-up, C rounds them
half-even (e.g. `123456789012345` → C …234, JS …235). The port below handles ties explicitly. Ties only arise for
exactly representable values with exactly 15 significant digits ending in 5, in practice integers ≥ 1e14.

## 3. The real sample: LEPRolmHn

Encoded string: `!WA:2!LvvZUTTrq4iRcKy2)Svsd…` (the full string is from `api/raw/encoded`). It's wago's re-encode;
the user's original upload isn't kept. Wago's JSON, as the Editor shows it, trimmed:

```json
{
  "d": {
    "actions": {
      "finish": [],
      "init": [],
      "start": []
    },
    "adjustedMax": "",
    "alpha": 1,
    "anchorFrameType": "SCREEN",
    "authorOptions": [],
    "color": [
      1,
      1,
      1,
      1
    ],
    "conditions": [],
    "config": [],
    "displayIcon": 133340,
    "id": "Eye buff missing",
    "information": [],
    "internalVersion": 90,
    "load": {
      "class": {
        "multi": []
      },
      "talent": {
        "multi": []
      }
    },
    "progressSource": [
      -1,
      ""
    ],
    "regionType": "icon",
    "semver": "1.0.0",
    "subRegions": [
      {
        "type": "subbackground"
      },
      { "…": "subtext, subglow" }
    ],
    "tocversion": 20506,
    "triggers": {
      "1": {
        "trigger": {
          "event": "Item Equipped",
          "itemName": 24116,
          "names": [],
          "spellIds": [],
          "type": "item",
          "unit": "player",
          "use_itemName": true
        },
        "untrigger": []
      },
      "2": {
        "trigger": {
          "auraspellids": [
            "31033"
          ],
          "matchesShowOn": "showOnMissing",
          "type": "aura2",
          "unit": "player",
          "useExactSpellId": true
        },
        "untrigger": []
      },
      "activeTriggerMode": -10,
      "disjunctive": "all"
    },
    "uid": "UDEfGNcylr4",
    "url": "https://wago.io/LEPRolmHn/1",
    "version": 1,
    "wagoID": "LEPRolmHn",
    "width": 64
  },
  "m": "d",
  "s": "5.21.9",
  "v": 1421,
  "wagoID": "LEPRolmHn"
}
```

(The `"…"` entry marks my trim; it isn't real data. A group would add `"c": [ {child d}, … ]` before `"d"`.)

### Our decoder vs wago's JSON for the same string (verified)

`core.decode(encoded)` (Musca v1.15.0 core) gives `{aura, children: [], senderVersion: "5.21.9",
transmissionVersion: 1421}`. Compared with wago's `d`, every scalar value is equal. The only differences are in
representation:

- **11 empty tables.** Ours are `{}`, wago's `[]`: `actions.finish/init/start`, `authorOptions`, `conditions`,
  `config`, `information`, `load.{class,size,spec,talent}.multi`, and inside the triggers `names`, `spellIds` and
  `untrigger` (×2).
- **`triggers` keys.** Ours `"[1]"`, `"[2]"`; wago's `"1"`, `"2"`.
- **Envelope.** Ours is `{aura, children, senderVersion, transmissionVersion}`. Wago's is `{d, c?, m, s, v,
  wagoID}`; `m` isn't exposed by our decoder.
- **Key order.** Ours is decoder order, wago's is sorted (§2).

There are no float or large-integer differences in this aura: every number has ≤ 14 significant digits.

## 4. Our document model vs wago's JSON: every conversion we need

From our canonical `LuaValue` (`src/core/lua-value.ts`) to wago's JSON:

1. **Envelope:** `{d: aura, c: children (omit when empty), m: "d", s: senderVersion, v: transmissionVersion}`,
   plus `wagoID` when `d.wagoID` exists (and wago's per-aura stamp if we ever know a wago id/version).
2. **Empty table:** `{}` → `[]`.
3. **Number keys:** `"[n]"` → `tostring(n)` with `%.14g` (`"[1]"`→`"1"`, `"[-3]"`→`"-3"`, `"[2.5]"`→`"2.5"`).
4. **Pure number-keyed objects with all keys in (0, 1000]:** become arrays padded with `null` up to the largest key.
   Ours keeps a sparse table like `{"[1]":true,"[208]":true}` as an object; wago writes `[true,null,…,true]`.
5. **Arrays longer than 1000:** become objects `{"1":…}`.
6. **Keys ≤ 0 or > 1000:** force the whole table to an object with stringified keys.
7. **Plain string keys:** `"1"` (Lua string "1") is indistinguishable from number key 1 in wago's JSON. It collides
   when both exist (bump rule).
8. **`["[x"]` escaped string keys:** written as the raw string `[x`.
9. **Boolean keys `"[true]"`:** wago can't encode them. Fail, or flag that wago would reject the aura.
10. **Numbers:** round to `%.14g` (half-even ties), then JS formatting. `-0` → `0`. Our model forbids NaN and inf
    (wago would write `null`).
11. **Strings:** no change (JS `JSON.stringify` escaping). Strings that weren't valid UTF-8 can't occur in our
    JS-string model; wago would have U+FFFD there.
12. **Key order:** sort as in §2. Arrays keep their order.
13. **Formatting:** 2-space `JSON.stringify` for the Editor form, compact for the API form.

The reverse (wago JSON → our document) is ambiguous: `"1"` could be a string or a number key, `[]` could be any
empty table, and nulls could be holes. wago's own encoder only restores number keys along these paths in `d` and
each `c[i]`:
- `triggers`, and per trigger `trigger.form.multi`, `talent.multi`, `specId.multi`, `herotalent.multi`,
  `actualSpec` and `arena_spec`
- `load.{talent,talent2,talent3,herotalent,instance_type,class_and_spec}.multi`

Anything else keeps string keys in strings that wago re-encodes.

## Reference port (verified against LEPRolmHn)

This port reproduces `code.json` byte for byte from `core.decode` output plus wago's stamp. It's written as a
standalone ES module; adapt it to `lua-value.ts` types when implementing.

```js
// C printf "%.14g" value (round half to even on the exact binary value), as LuaJIT tostring prints numbers.
export function g14(x) {
  if (!Number.isFinite(x) || x === 0) return x;
  const [mant, exp] = Math.abs(x).toExponential(99).split("e"); // 100 exact significant digits
  const digits = mant.replace(".", "");
  if (/^50*$/.test(digits.slice(14))) {
    let keep = BigInt(digits.slice(0, 14));
    if (keep % 2n === 1n) keep += 1n;
    return Math.sign(x) * Number(`${keep}e${Number(exp) - 13}`);
  }
  return Number(x.toPrecision(14));
}
// keyFromString as in lua-value.ts
export function toWagoValue(v) {
  if (typeof v === "number") return Number.isFinite(v) ? g14(v) : null;
  if (typeof v !== "object" || v === null) return v;
  const pairs = Array.isArray(v) ? v.map((x, i) => [i + 1, x]) : Object.entries(v).map(([k, x]) => [keyFromString(k), x]);
  if (pairs.some(([k]) => typeof k === "boolean")) throw new Error("wago's json.lua errors on boolean keys");
  if (pairs.length === 0) return [];
  const numeric = pairs.filter(([k]) => typeof k === "number");
  if (numeric.length === pairs.length && numeric.every(([k]) => k > 0 && k <= 1000)) {
    const max = Math.max(...numeric.map(([k]) => k)), byKey = new Map(numeric), out = [];
    for (let i = 1; i <= max; i++) out.push(byKey.has(i) ? toWagoValue(byKey.get(i)) : null);
    return out;
  }
  const obj = {}, strings = new Set(pairs.filter(([k]) => typeof k === "string").map(([k]) => k));
  for (const [k, x] of pairs) if (typeof k === "string") obj[k] = toWagoValue(x);
  for (const [k, x] of numeric.sort(([a], [b]) => a - b)) {
    let key = String(g14(k));
    if (strings.has(key)) { let n = k + 1; while (key = String(g14(n)), strings.has(key) || key in obj) n++; }
    obj[key] = toWagoValue(x);
  }
  return obj;
}
function sortJSON(o) {
  if (Array.isArray(o)) return o.map((x) => (x && typeof x === "object" ? sortJSON(x) : x));
  const s = {};
  for (const k of Object.keys(o).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) s[k] = o[k] && typeof o[k] === "object" ? sortJSON(o[k]) : o[k];
  return s;
}
export function wagoJson({ aura, children, senderVersion, transmissionVersion }, { pretty = true } = {}) {
  const t = { m: "d", d: aura, v: transmissionVersion, s: senderVersion };
  if (children.length) t.c = children;
  const json = toWagoValue(t);
  if (typeof json.d.wagoID === "string") json.wagoID = json.d.wagoID; // wago's top-level stamp
  const out = sortJSON(json);
  return pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);
}
```

## Unverified / limits

- I didn't run wago's `json.lua` (local execution was blocked); the edge rules in §2 are read from source. Not
  reached by the sample, so not checked against wago: sparse arrays, keys > 1000 or ≤ 0, the collision bump, the
  boolean-key failure, ±inf, and non-UTF-8 strings.
- wago's production LuaJIT version is unknown. `.devcontainer` pins `luajit-2.1.0-beta3`; I checked `%.14g` on local
  LuaJIT 2.1. Every 2.x build has used `%.14g` for `tostring`.
- I only checked a single aura with no children. The group path (`c`, each child stamped and sorted) is read, not
  tested.
- The user's original upload string isn't available (wago overwrites `encoded`). So "original string → wago JSON" is
  checked only through wago's own re-encode, which decodes back to the stored JSON exactly.
- I didn't check whether `Origin: https://wago.io` is required for `data.wago.io/lookup/*`.
- I didn't check the hosted site's live UI; its labels ("Editor", "Table data", "Export/Fork changes") come from the
  repo source.
