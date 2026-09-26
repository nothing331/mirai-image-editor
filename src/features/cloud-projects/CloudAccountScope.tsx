"use client";

import { useEffect } from "react";
import { activateCloudDraftAccount } from "./cloud-draft-cache";

export function CloudAccountScope({ ownerId }: { ownerId: string }) {
  useEffect(() => { void activateCloudDraftAccount(ownerId).catch(() => {}); }, [ownerId]);
  return null;
}
