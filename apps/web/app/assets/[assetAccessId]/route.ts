import { assetByAccessId } from "@inkrelay/db";

import { assetStore, database } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetAccessId: string }> },
) {
  const { assetAccessId } = await context.params;
  const record = await assetByAccessId(database(), assetAccessId);
  if (!record) return new Response("Not found", { status: 404 });
  const asset = await assetStore().get(record.storageKey);
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(asset.body), {
    headers: {
      "content-type": record.contentType,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
    },
  });
}
