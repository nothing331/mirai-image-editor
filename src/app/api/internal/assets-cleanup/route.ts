import { authorizedAssetOwner, assetResponse, privateHeaders } from "@/server/assets/http";
import { reconcileExpiredOriginalUploads } from "@/server/assets/original-assets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await authorizedAssetOwner(request, true, "owner");
    const cleaned = await reconcileExpiredOriginalUploads();
    return Response.json({ cleaned }, { headers: privateHeaders });
  } catch (error) { return assetResponse(error); }
}
