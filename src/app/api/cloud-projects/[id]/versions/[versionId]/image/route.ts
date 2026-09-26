import { readCloudVersionBytes } from "@/server/cloud-projects/cloud-edit-history";
import { authorizedProjectOwner, projectIdSchema, projectResponse } from "@/server/cloud-projects/http";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const ownerId = await authorizedProjectOwner(request, false);
    const { id, versionId } = await params;
    const bytes = await readCloudVersionBytes(ownerId, projectIdSchema.parse(id), projectIdSchema.parse(versionId));
    return new Response(Buffer.from(bytes), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) { return projectResponse(error); }
}
