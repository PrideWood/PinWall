import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { ArrowLeft, Smartphone, RefreshCw } from "lucide-react";
import type { Board, Snapshot } from "../types/board";
export function BoardViewer({
  board,
  initial,
  onBack,
  onEdit,
  onReload,
}: {
  board: Board;
  initial: Snapshot;
  onBack: () => void;
  onEdit: () => void;
  onReload: () => void;
}) {
  return (
    <div className="editor-shell">
      <main className="canvas">
        <Excalidraw
          key={`${board.id}:${board.version}`}
          name={board.title}
          initialData={{
            ...initial.scene,
            files: initial.files,
            scrollToContent: true,
          }}
          viewModeEnabled
          langCode="zh-CN"
          renderTopRightUI={() => (
            <button
              className="excalidraw-owner-button"
              title="手机扫码授权编辑"
              aria-label="手机扫码授权编辑"
              onClick={onEdit}
            >
              <Smartphone size={18} />
            </button>
          )}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              clearCanvas: false,
              changeViewBackgroundColor: false,
              export: false,
            },
          }}
        >
          <MainMenu>
            <MainMenu.Item icon={<ArrowLeft size={16} />} onSelect={onBack}>
              白板列表
            </MainMenu.Item>
            <MainMenu.Item icon={<RefreshCw size={16} />} onSelect={onReload}>
              刷新白板
            </MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        </Excalidraw>
      </main>
    </div>
  );
}
