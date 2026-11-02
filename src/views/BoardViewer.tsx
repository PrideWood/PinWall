import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { ArrowLeft, Smartphone, RefreshCw } from "lucide-react";
import type { Board, Snapshot } from "../types/board";
import { useCanvasTheme } from "../lib/theme";
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
  const [theme, setTheme] = useCanvasTheme();
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
          theme={theme}
          onChange={(_elements, state) => setTheme(state.theme)}
          langCode="zh-CN"
          renderTopRightUI={() => (
            <button
              className="excalidraw-owner-button"
              title="授权编辑"
              aria-label="授权编辑"
              onClick={onEdit}
            >
              <Smartphone size={18} />
            </button>
          )}
          UIOptions={{
            canvasActions: {
              toggleTheme: true,
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
            <MainMenu.Item icon={<Smartphone size={16} />} onSelect={onEdit}>
              授权编辑
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
