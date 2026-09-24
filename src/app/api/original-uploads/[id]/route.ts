import { authorizedAssetOwner, assetResponse, privateHeaders, uuid } from "@/server/assets/http";
import { cancelOriginalUpload, signedOriginalRead, uploadOriginalBytes } from "@/server/assets/original-assets";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const ownerId = await authorizedAssetOwner(request, true);
    const id = uuid.parse((await context.params).id);
    await uploadOriginalBytes(ownerId, id, request);
    return Response.json({ id, state: "uploaded" }, { headers: privateHeaders });
  } catch (error) { return assetResponse(error); }
}

export async function GET(request: Request, context: Context) {
  try {
    const ownerId = await authorizedAssetOwner(request, false);
    const id = uuid.parse((await context.params).id);
    const role = new URL(request.url).searchParams.get("role");
    if (role !== "source" && role !== "base") return Response.json({ error: "Choose source or base." }, { status: 400, headers: privateHeaders });
    return Response.json(await signedOriginalRead(ownerId, id, role), { headers: privateHeaders });
  } catch (error) { return assetResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const ownerId = await authorizedAssetOwner(request, true);
    await cancelOriginalUpload(ownerId, uuid.parse((await context.params).id));
    return Response.json({ cancelled: true }, { headers: privateHeaders });
  } catch (error) { return assetResponse(error); }
}
