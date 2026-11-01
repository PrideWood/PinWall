import type { Draft } from "../types/board";
const NAME = "whiteboard-private-drafts";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
let pending: Promise<unknown> = Promise.resolve();
function operation<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const work = async () => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = db.transaction("drafts", mode);
        const request = action(transaction.objectStore("drafts"));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  };
  const result = pending.then(work, work);
  pending = result.catch(() => {});
  return result;
}
type BufferedDraft = {
  value: Draft;
  timer: ReturnType<typeof setTimeout>;
  waiters: { resolve: () => void; reject: (error: unknown) => void }[];
};
const buffered = new Map<string, BufferedDraft>();
function flushBuffered(key: string) {
  const entry = buffered.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  buffered.delete(key);
  void operation("readwrite", (store) => store.put(entry.value, key)).then(
    () => entry.waiters.forEach((waiter) => waiter.resolve()),
    (error) => entry.waiters.forEach((waiter) => waiter.reject(error)),
  );
}
function cancelBuffered(key: string) {
  const entry = buffered.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  buffered.delete(key);
  entry.waiters.forEach((waiter) => waiter.resolve());
}
export const getDraft = (owner: string, board: string) => {
  const key = `${owner}:${board}`;
  flushBuffered(key);
  return operation<Draft | undefined>("readonly", (store) => store.get(key));
};
// Coalesce pointer-move checkpoints so large image drafts do not queue hundreds of writes.
export function putDraft(draft: Draft): Promise<void> {
  const key = `${draft.owner}:${draft.board}`;
  let entry = buffered.get(key);
  if (!entry) {
    entry = {
      value: draft,
      timer: setTimeout(() => flushBuffered(key), 200),
      waiters: [],
    };
    buffered.set(key, entry);
  }
  entry.value = draft;
  return new Promise((resolve, reject) =>
    entry.waiters.push({ resolve, reject }),
  );
}
export const removeDraft = (owner: string, board: string) => {
  const key = `${owner}:${board}`;
  cancelBuffered(key);
  return operation("readwrite", (store) => store.delete(key));
};
export const clearDrafts = () => {
  for (const key of buffered.keys()) cancelBuffered(key);
  return operation("readwrite", (store) => store.clear());
};
export const flushDrafts = () => {
  for (const key of buffered.keys()) flushBuffered(key);
};
window.addEventListener("pagehide", flushDrafts);
