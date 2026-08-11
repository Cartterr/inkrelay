import { checkDatabaseReady, isSystemReady } from "@inkrelay/db";

import { database } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const connection = database();
    const [dbReady, workerReady] = await Promise.all([
      checkDatabaseReady(connection),
      isSystemReady(connection),
    ]);
    const ready = dbReady && workerReady;
    return Response.json(
      { status: ready ? "ready" : "degraded", checks: { database: dbReady, worker: workerReady } },
      { status: ready ? 200 : 503 },
    );
  } catch {
    return Response.json(
      { status: "degraded", checks: { database: false, worker: false } },
      { status: 503 },
    );
  }
}
