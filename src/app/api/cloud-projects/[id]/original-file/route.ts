import { downloadOriginalSource } from "@/server/assets/original-assets";
import { getCloudProject } from "@/server/cloud-projects/cloud-projects";
import { authorizedProjectOwner, projectIdSchema, projectResponse } from "@/server/cloud-projects/http";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await authorizedProjectOwner(request, false);
    const project = await getCloudProject(ownerId, projectIdSchema.parse((await params).id));
    const original = await downloadOriginalSource(ownerId, project.originalUploadId);
    const fallback = original.mediaType === "image/jpeg" ? "original.jpg" : "original.png";
    const filename = original.name.replace(/[^a-zA-Z0-9._ -]/g, "_")
      .replace(/^\.+/, "").slice(0, 100) || fallback;
    return new Response(Buffer.from(original.bytes), { headers: {
      "Content-Type": original.mediaType,
      "Content-Disposition": `attachment; filename="${filename.replaceAll('"', "_")}"`,
      "Content-Length": String(original.bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return projectResponse(error); }
}
