/** HTTP glue for the addon routes: error responses, file and bundle responses. */
import { ADDON_BUNDLE_SETS, type AddonBundleSet } from "@/core";
import { getEncodedAddonBundle } from "./bundle";
import { getAddonSourceCache } from "./index";
import { AddonRefError } from "./refs";
import type { Resolution } from "./source-cache";

export function errorResponse(e: unknown): Response {
  const status = e instanceof AddonRefError ? e.status : 500;
  const message = e instanceof Error ? e.message : String(e);
  return Response.json({ error: message }, { status });
}

const TEXT = /\.(lua|md|txt|toc|xml|json|yml|yaml|toml|gitignore|gitattributes)$/i;
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml" };

function contentType(file: string): string {
  if (TEXT.test(file)) return "text/plain; charset=utf-8";
  const ext = /\.([a-z0-9]+)$/i.exec(file)?.[1]?.toLowerCase() ?? "";
  return TYPES[ext] ?? "application/octet-stream";
}

/** Releases and commits are immutable; branch answers expire. */
function cacheControl(resolution: Resolution): string {
  return resolution.kind === "branch" ? "public, max-age=300" : "public, max-age=31536000, immutable";
}

/** Serves one addon file through the disk cache. */
export async function addonFileResponse(ref: string, file: string): Promise<Response> {
  try {
    const { resolution, bytes } = await getAddonSourceCache().readFile(ref, file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType(file),
        "Cache-Control": cacheControl(resolution),
        "X-Addon-Ref": resolution.ref,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Serves every file a loader needs as one JSON `{ ref, set, files: { path: source } }` with a content
 * ETag, cached like single files. `format=json` (default) is plain JSON, compressed by the platform if at
 * all; `format=gzip` is the same JSON pre-gzipped once on the server, as an `application/gzip` body
 * (Next.js won't pass a route's own Content-Encoding through, so the browser inflates it itself).
 */
export async function addonBundleResponse(
  request: Request,
  ref: string,
  set: string | null,
  format: string | null,
): Promise<Response> {
  if (!ADDON_BUNDLE_SETS.includes(set as AddonBundleSet)) {
    return Response.json({ error: `set must be one of: ${ADDON_BUNDLE_SETS.join(", ")}` }, { status: 400 });
  }
  format ??= "json";
  if (format !== "json" && format !== "gzip") {
    return Response.json({ error: "format must be json or gzip" }, { status: 400 });
  }
  try {
    const bundle = await getEncodedAddonBundle(getAddonSourceCache(), ref, set as AddonBundleSet);
    const headers: Record<string, string> = {
      "Content-Type": format === "gzip" ? "application/gzip" : "application/json; charset=utf-8",
      "Cache-Control": cacheControl(bundle.resolution),
      ETag: bundle.etag,
      "X-Addon-Ref": bundle.resolution.ref,
    };
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch?.split(",").some((t) => t.trim().replace(/^W\//, "") === bundle.etag)) {
      return new Response(null, { status: 304, headers });
    }
    const body = format === "gzip" ? await bundle.gzipped() : bundle.json;
    return new Response(new Uint8Array(body), { headers });
  } catch (e) {
    return errorResponse(e);
  }
}
