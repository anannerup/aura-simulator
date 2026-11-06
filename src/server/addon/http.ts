/** HTTP glue for the addon routes: error responses and file responses. */
import { getAddonSourceCache } from "./index";
import { AddonRefError } from "./refs";

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

/** Serves one addon file through the disk cache. Releases and commits are immutable; branch answers expire. */
export async function addonFileResponse(ref: string, file: string): Promise<Response> {
  try {
    const { resolution, bytes } = await getAddonSourceCache().readFile(ref, file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType(file),
        "Cache-Control":
          resolution.kind === "branch" ? "public, max-age=300" : "public, max-age=31536000, immutable",
        "X-Addon-Ref": resolution.ref,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
