import type { EditPreview, LocalEditDraft, MaskAsset, OverlayImageAsset, PaintSession, ProcessingMask, ImageVersion, EditOperation } from "@/features/editor/types";

const DB_NAME = "mirai-cloud-drafts-v1";
const STORE = "drafts";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
let writeQueue: Promise<unknown> = Promise.resolve();
let cacheEpoch = 0;
let cacheDisabled = false;
const sessionChannel = typeof window === "undefined" || typeof BroadcastChannel === "undefined"
  ? null : new BroadcastChannel("mirai-cloud-session");
if (sessionChannel) sessionChannel.onmessage = (event) => {
  if (event.data === "purge-drafts") { cacheEpoch++; cacheDisabled = true; }
};

export interface CloudDraftSnapshot {
  schema: 1;
  ownerId: string;
  projectId: string;
  inputVersionId: string;
  savedAt: number;
  localDraft: LocalEditDraft | null;
  paintSession: PaintSession | null;
  selectionMask: ProcessingMask | null;
  preview: EditPreview | null;
  pendingAcceptance: { input: ImageVersion; output: ImageVersion; operation: EditOperation; mask: MaskAsset; preserveSelection: boolean } | null;
  overlayAssets: OverlayImageAsset[];
  commitKeys: { requestKey: string; assetId: string } | null;
}

const keyOf = (ownerId: string, projectId: string) => `${ownerId}:${projectId}`;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (cause: unknown) => void) => void): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      transaction.onerror = () => reject(transaction.error);
      action(transaction.objectStore(STORE), resolve, reject);
    });
  } finally { db.close(); }
}

export async function loadCloudDraft(ownerId: string, projectId: string, inputVersionId: string): Promise<CloudDraftSnapshot | null> {
  const saved = await transact<unknown>("readonly", (store, resolve, reject) => {
    const request = store.get(keyOf(ownerId, projectId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!saved || typeof saved !== "object") return null;
  const draft = saved as CloudDraftSnapshot;
  if (draft.schema !== 1 || draft.ownerId !== ownerId || draft.projectId !== projectId
    || draft.inputVersionId !== inputVersionId || !Number.isFinite(draft.savedAt)
    || Date.now() - draft.savedAt > MAX_AGE) {
    await clearCloudDraft(ownerId, projectId);
    return null;
  }
  return draft;
}

export async function saveCloudDraft(draft: CloudDraftSnapshot): Promise<void> {
  if (cacheDisabled) throw new Error("Draft storage is unavailable after sign-out.");
  const epoch = cacheEpoch;
  const write = writeQueue.catch(() => {}).then(async () => {
    if (epoch !== cacheEpoch || cacheDisabled) return;
    await transact<void>("readwrite", (store, resolve, reject) => {
      const request = store.put(draft, keyOf(draft.ownerId, draft.projectId));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
  writeQueue = write;
  await write;
}

export async function clearCloudDraft(ownerId: string, projectId: string): Promise<void> {
  cacheEpoch++;
  await writeQueue.catch(() => {});
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(keyOf(ownerId, projectId));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllCloudDrafts(): Promise<void> {
  cacheEpoch++;
  cacheDisabled = true;
  sessionChannel?.postMessage("purge-drafts");
  await writeQueue.catch(() => {});
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Draft storage is busy."));
  });
}

export async function activateCloudDraftAccount(ownerId: string): Promise<void> {
  const previous = localStorage.getItem("mirai-cloud-draft-owner");
  if (previous && previous !== ownerId) {
    await clearAllCloudDrafts();
    cacheDisabled = false;
  }
  localStorage.setItem("mirai-cloud-draft-owner", ownerId);
}
