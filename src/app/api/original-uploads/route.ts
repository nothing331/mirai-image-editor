import { authorizedAssetOwner, assetResponse, privateHeaders, reservationInput } from "@/server/assets/http";
import { AssetError, reserveOriginalUpload } from "@/server/assets/original-assets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ownerId = await authorizedAssetOwner(request, true);
    const raw = await request.text();
    if (raw.length > 1_024) return Response.json({ error: "Upload details are too large." }, { status: 413, headers: privateHeaders });
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { throw new AssetError("invalid", "Check the upload details."); }
    const input = reservationInput.parse(parsed);
    const upload = await reserveOriginalUpload(ownerId, input);
    return Response.json({ id: upload.id, state: upload.state, expiresAt: upload.expires_at }, { status: 201, headers: privateHeaders });
  } catch (error) { return assetResponse(error); }
}
