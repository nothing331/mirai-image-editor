import { authorizedAssetOwner, assetResponse, privateHeaders, uuid } from "@/server/assets/http";
import { finalizeOriginalUpload } from "@/server/assets/original-assets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await authorizedAssetOwner(request, true);
    const receipt = await finalizeOriginalUpload(ownerId, uuid.parse((await params).id));
    return Response.json(receipt, { headers: privateHeaders });
  } catch (error) { return assetResponse(error); }
}
