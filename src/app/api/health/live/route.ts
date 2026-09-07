export const dynamic = "force-dynamic";

export function GET() {
  const releaseId = process.env.MIRAI_RELEASE_ID ?? process.env.RENDER_GIT_COMMIT ?? process.env.GITHUB_SHA ?? "local";
  return Response.json(
    { status: "live", releaseId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
