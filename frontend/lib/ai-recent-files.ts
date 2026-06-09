const DB_NAME = "ran_ai_recent_files";
const STORE = "files";
const DB_VERSION = 1;
const MAX_FILES = 8;
const MAX_BYTES = 4 * 1024 * 1024;

export type RecentFileRecord = {
  id: string;
  name: string;
  mime: string;
  size: number;
  savedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRecentFile(file: File): Promise<void> {
  if (file.size > MAX_BYTES) return;

  const db = await openDb();
  const id = `${Date.now()}-${file.name}`;
  const record = {
    id,
    name: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size,
    savedAt: new Date().toISOString(),
    blob: file,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const all = await listRecentFiles();
  if (all.length > MAX_FILES) {
    const stale = all.slice(MAX_FILES);
    await Promise.all(stale.map((item) => deleteRecentFile(item.id)));
  }
}

export async function listRecentFiles(): Promise<RecentFileRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => {
      const rows = (request.result as Array<RecentFileRecord & { blob?: Blob }>)
        .map(({ id, name, mime, size, savedAt }) => ({ id, name, mime, size, savedAt }))
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function loadRecentFile(id: string): Promise<File | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => {
      const row = request.result as { blob?: Blob; name?: string; mime?: string } | undefined;
      if (!row?.blob) {
        resolve(null);
        return;
      }
      resolve(new File([row.blob], row.name || "recent-file", { type: row.mime || "application/octet-stream" }));
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteRecentFile(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
