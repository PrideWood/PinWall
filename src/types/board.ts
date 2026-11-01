import type {
  ExcalidrawInitialDataState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
export type Scene = {
  elements: NonNullable<ExcalidrawInitialDataState["elements"]>;
  appState: { viewBackgroundColor?: string; gridSize?: number };
};
export type Snapshot = { scene: Scene; files: BinaryFiles };
export type Board = {
  id: string;
  title: string;
  version: number;
  updated_at: string;
  created_at: string;
};
export type LoadedBoard = Board & {
  scene_json: Scene;
  images: { file_id: string; mime_type: string; created_at: string }[];
};
export type User = { id: string };
export type Draft = {
  owner: string;
  board: string;
  version: number;
  snapshot: Snapshot;
  savedAt: number;
};
