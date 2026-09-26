import sharp from "sharp";
import { getCloudProject } from "@/server/cloud-projects/cloud-projects";
import { readCloudVersionBytes } from "@/server/cloud-projects/cloud-edit-history";
import { authorizedProjectOwner, projectIdSchema, projectResponse } from "@/server/cloud-projects/http";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await authorizedProjectOwner(request, false);
    const project = await getCloudProject(ownerId, projectIdSchema.parse((await params).id));
    const bytes = await readCloudVersionBytes(ownerId, project.id, project.currentVersionId);
    const thumbnail = await sharp(bytes, { limitInputPixels: 4_194_304 })
      .resize(480, 320, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#e8e5dc" })
      .jpeg({ quality: 74, mozjpeg: true }).toBuffer();
    return new Response(thumbnail, { headers: {
      "Content-Type": "image/jpeg", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return projectResponse(error); }
}
