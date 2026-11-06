import { connection } from "next/server";
import { getAddonSourceCache } from "@/server/addon";
import { errorResponse } from "@/server/addon/http";

/** GET /api/addon/versions: releases (newest first, real tag names), the default release and branch names. */
export async function GET() {
  await connection();
  try {
    return Response.json(await getAddonSourceCache().versions());
  } catch (e) {
    return errorResponse(e);
  }
}
