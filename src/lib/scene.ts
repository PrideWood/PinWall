import { serializeAsJSON } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  FileId,
} from "@excalidraw/excalidraw/element/types";
import type { LoadedBoard, Scene, Snapshot } from "../types/board";
import { api } from "./api";
export function snapshot(
  elements: readonly ExcalidrawElement[],
  state: AppState,
  files: BinaryFiles,
): Snapshot {
  const serialized = JSON.parse(
    serializeAsJSON(elements, state, {}, "database"),
  );
  return {
    scene: {
      elements: serialized.elements.map((e: ExcalidrawElement) =>
        e.type === "image" ? { ...e, status: "saved" } : e,
      ),
      appState: {
        viewBackgroundColor: state.viewBackgroundColor,
        gridSize: state.gridSize,
      },
    },
    files: { ...files },
  };
}
export function signature(scene: Scene) {
  return JSON.stringify(scene);
}
const refs = (scene: Scene) => [
  ...new Set(
    scene.elements.flatMap((e) =>
      e.type === "image" && !e.isDeleted && e.fileId ? [e.fileId] : [],
    ),
  ),
];
export async function persistSnapshot(
  board: string,
  value: Snapshot,
  version: number,
  uploaded: Set<string>,
) {
  for (const id of refs(value.scene)) {
    if (uploaded.has(id)) continue;
    const file = value.files[id];
    if (!file) throw new Error("图片数据缺失，请重新插入图片或恢复完整备份。");
    const blob = await (await fetch(file.dataURL)).blob();
    if (blob.size > 3 * 1024 * 1024)
      throw new Error("单张图片最大 3 MB，请压缩后重新插入。");
    await api(`/boards/${board}/images/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: blob,
    });
    uploaded.add(id);
  }
  const result = await api<{ version: number }>(`/boards/${board}`, {
    method: "PUT",
    body: JSON.stringify({ version, scene: value.scene }),
  });
  return result.version;
}
export function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取图片。"));
    reader.readAsDataURL(blob);
  });
}
export async function restoreImages(board: LoadedBoard): Promise<Snapshot> {
  const files: BinaryFiles = {};
  for (const id of refs(board.scene_json)) {
    const meta = board.images.find((i) => i.file_id === id);
    if (!meta) throw new Error("云端图片记录缺失，已停止加载以避免覆盖白板。");
    const response = await fetch(
      `/api/boards/${board.id}/images/${encodeURIComponent(id)}`,
      { cache: "no-store", signal: AbortSignal.timeout(45000) },
    );
    if (!response.ok) throw new Error("图片加载失败，请重试。");
    files[id] = {
      id: id as FileId,
      dataURL: (await dataUrl(
        await response.blob(),
      )) as BinaryFiles[string]["dataURL"],
      mimeType: meta.mime_type as BinaryFiles[string]["mimeType"],
      created: Date.parse(meta.created_at),
    };
  }
  return { scene: board.scene_json, files };
}
export function downloadSnapshot(value: Snapshot, title: string) {
  const blob = new Blob(
    [
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: window.location.origin,
        ...value.scene,
        files: value.files,
      }),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[<>:"/\\|?*]/g, "_")}.excalidraw`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
