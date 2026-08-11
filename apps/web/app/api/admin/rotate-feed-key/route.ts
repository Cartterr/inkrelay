import { rotateFeedAccess } from "@inkrelay/db";

import { requireOwner } from "@/lib/auth";
import { database, runtimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const actor = await requireOwner();
    const key = await rotateFeedAccess(database(), actor, runtimeConfig().feedAccessKey);
    return Response.json(
      { key, previousKeyGraceHours: 24 },
      { headers: { "cache-control": "no-store", pragma: "no-cache" } },
    );
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}
