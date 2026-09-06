import { timingSafeEqual } from "node:crypto";

export type CloudSpikeAuthorization =
  | { authorized: true }
  | { authorized: false; status: 404 | 409 | 500; error: string };

export function authorizeCloudSpike(request: Request): CloudSpikeAuthorization {
  if (process.env.CLOUD_SPIKE_ENABLED !== "true") {
    return { authorized: false, status: 404, error: "Not found." };
  }
  if (process.env.IMAGE_EDIT_PROVIDER !== "fake" || process.env.ASSET_GENERATION_PROVIDER !== "fake") {
    return { authorized: false, status: 409, error: "Cloud spike requires fake providers." };
  }

  const expected = process.env.CLOUD_SPIKE_TOKEN ?? "";
  if (expected.length < 32) {
    return { authorized: false, status: 500, error: "Cloud spike is not configured safely." };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    return { authorized: false, status: 404, error: "Not found." };
  }

  return { authorized: true };
}
