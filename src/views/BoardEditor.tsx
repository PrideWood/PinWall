import {
  Excalidraw,
  MainMenu,
  loadFromBlob,
  useHandleLibrary,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  LogOut,
  RefreshCw,
  Upload,
  Smartphone,
  Presentation,
  Ellipsis,
  ChevronUp,
} from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { Board, Snapshot, User } from "../types/board";
import { SaveQueue, type SaveStatus } from "../lib/saveQueue";
import { putDraft, removeDraft } from "../lib/drafts";
import { libraryReturnUrl } from "../lib/boardLocation";
import { useCanvasTheme } from "../lib/theme";
import { useFramePresentation } from "../lib/useFramePresentation";
import { FramePresentation } from "./FramePresentation";
import { ConfirmExitDialog } from "./ConfirmExitDialog";
import {
  downloadSnapshot,
  persistSnapshot,
  signature,
  snapshot,
} from "../lib/scene";

type Props = {
  board: Board;
  user: User;
  initial: Snapshot;
  recovered: boolean;
  uploaded: string[];
  onBack: () => void;
  onLogout: () => Promise<void>;
  onReload: () => void;
};
const labels: Record<SaveStatus, string> = {
  saved: "已保存到云端",
  pending: "等待保存",
  saving: "正在保存…",
  failed: "保存失败",
  conflict: "版本冲突",
};
export function BoardEditor({
  board,
  user,
  initial,
  recovered,
  uploaded,
  onBack,
  onLogout,
  onReload,
}: Props) {
  const [theme, setTheme] = useCanvasTheme();
  const [, render] = useState(0);
  const [draftError, setDraftError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);
  const [mobileToolsExpanded, setMobileToolsExpanded] = useState(false);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const presentation = useFramePresentation(api);
  useHandleLibrary({ excalidrawAPI: api });
  useEffect(() => {
    // The library catalogue targets this tab when installing a library.
    const previousName = window.name;
    window.name = `whiteboard${crypto.randomUUID().replaceAll("-", "")}`;
    return () => {
      window.name = previousName;
    };
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const sig = useRef(signature(initial.scene));
  const mounted = useRef(true);
  const uploadedIds = useRef(new Set(uploaded));
  const [queue] = useState(
    () =>
      new SaveQueue(
        initial,
        board.version,
        (value, version) =>
          persistSnapshot(board.id, value, version, uploadedIds.current),
        () => {
          if (mounted.current) render((v) => v + 1);
        },
        (value, version, saved) => {
          const write = saved
            ? removeDraft(user.id, board.id)
            : putDraft({
                owner: user.id,
                board: board.id,
                version,
                snapshot: value,
                savedAt: Date.now(),
              });
          void write.catch(() => {
            if (mounted.current)
              setDraftError(
                "无法保存本地恢复草稿，请保持页面打开，或导出备份。",
              );
          });
        },
      ),
  );
  useEffect(() => {
    mounted.current = true;
    queue.activate();
    if (recovered) queue.enqueue(initial);
    const warn = (event: BeforeUnloadEvent) => {
      if (queue.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const retry = () => {
      if (queue.status === "failed") void queue.flush();
    };
    const lock = () => queue.dispose();
    window.addEventListener("beforeunload", warn);
    window.addEventListener("online", retry);
    window.addEventListener("whiteboard-lock", lock);
    return () => {
      mounted.current = false;
      queue.dispose();
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("online", retry);
      window.removeEventListener("whiteboard-lock", lock);
    };
  }, [queue, recovered, initial]);
  async function leave(action: "back" | "logout" | "reload") {
    setBusy(true);
    const saved = await queue.flush();
    if (!saved && queue.dirty) {
      const text =
        action === "logout"
          ? "当前内容尚未保存。退出将清除本机草稿。请取消并先导出备份。仍然退出？"
          : action === "reload"
            ? "加载云端版本会放弃当前画布及本地草稿。请先导出备份。继续？"
            : "当前内容尚未保存到云端。保留本机恢复草稿并返回？";
      if (!window.confirm(text)) {
        setBusy(false);
        return;
      }
    }
    try {
      if (action === "reload") {
        await removeDraft(user.id, board.id);
        onReload();
      } else if (action === "logout") await onLogout();
      else onBack();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File) {
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error("导入文件最大 30 MB。");
      const scene = await loadFromBlob(file, null, null);
      if (!api) return;
      if (!window.confirm("用导入文件替换当前画布？建议先导出当前白板。"))
        return;
      if (scene.files) api.addFiles(Object.values(scene.files));
      api.updateScene({
        elements: scene.elements,
        appState: scene.appState,
      });
      api.scrollToContent();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败。");
    }
  }
  return (
    <div className="editor-shell">
      {(queue.error || draftError || message) && (
        <div className="editor-notice" role="alert">
          {queue.error || draftError || message}
          {queue.status === "failed" && (
            <button onClick={() => void queue.flush()}>重试保存</button>
          )}
          {queue.status === "conflict" && (
            <button onClick={() => void leave("reload")}>加载云端版本</button>
          )}
        </div>
      )}
      <main className="canvas">
        <div
          className={`canvas-surface mobile-editor${mobileToolsExpanded ? " mobile-tools-expanded" : ""}${presentation.active ? " is-presenting" : ""}`}
          onContextMenuCapture={presentation.active ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
        >
          <Excalidraw
            initialData={{
              ...initial.scene,
              files: initial.files,
              scrollToContent: true,
            }}
            langCode="zh-CN"
            theme={theme}
            UIOptions={{ canvasActions: { toggleTheme: true } }}
            name={board.title}
            libraryReturnUrl={libraryReturnUrl(location.href, board.id)}
            renderTopRightUI={(isMobile, state) => (
              <div className="canvas-toolbar-actions">
                {isMobile ? (
                  <button
                    className="excalidraw-mobile-tools-button"
                    aria-label={mobileToolsExpanded ? "收起工具" : "更多工具"}
                    title={mobileToolsExpanded ? "收起工具" : "更多工具"}
                    aria-expanded={mobileToolsExpanded}
                    data-active-tool={state.activeTool.type}
                    onClick={() => setMobileToolsExpanded((expanded) => !expanded)}
                  >
                    {mobileToolsExpanded ? <ChevronUp size={22} /> : <Ellipsis size={22} />}
                  </button>
                ) : (
                  <button className="excalidraw-presentation-button" aria-label="演示" title="演示" onClick={presentation.start} disabled={!api || busy}>
                    <Presentation size={18} />
                  </button>
                )}
                <button
                  className="excalidraw-owner-button is-owner"
                  aria-label="退出编辑"
                  title={`编辑中 · ${labels[queue.status]} · 点击退出编辑`}
                  onClick={() => {
                    setMessage("");
                    setConfirmExit(true);
                  }}
                  disabled={busy}
                >
                  <Smartphone size={18} />
                  <span className={`edit-save-dot is-${queue.status}`} />
                </button>
              </div>
            )}
            excalidrawAPI={setApi}
            onChange={(elements, state, files) => {
              setTheme(state.theme);
              const value = snapshot(elements, state, files);
              const next = signature(value.scene);
              if (next === sig.current) return;
              sig.current = next;
              queue.enqueue(value);
            }}
          >
            <MainMenu>
              <MainMenu.Item
                icon={<ArrowLeft size={16} />}
                onSelect={() => void leave("back")}
              >
                白板列表
              </MainMenu.Item>
              <MainMenu.Item icon={<Presentation size={16} />} onSelect={presentation.start}>
                演示画框
              </MainMenu.Item>
              <MainMenu.Item
                icon={<Upload size={16} />}
                onSelect={() => input.current?.click()}
              >
                导入白板
              </MainMenu.Item>
              <MainMenu.Item
                icon={<Download size={16} />}
                onSelect={() => downloadSnapshot(queue.latest, board.title)}
              >
                导出白板备份
              </MainMenu.Item>
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Item
                icon={<RefreshCw size={16} />}
                onSelect={() => void leave("reload")}
              >
                重新加载云端版本
              </MainMenu.Item>
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              <MainMenu.DefaultItems.Help />
              <MainMenu.Item
                icon={<LogOut size={16} />}
                onSelect={() => void leave("logout")}
              >
                退出编辑
              </MainMenu.Item>
            </MainMenu>
          </Excalidraw>
        </div>
        {presentation.active && <FramePresentation {...presentation} />}
      </main>
      {confirmExit && (
        <ConfirmExitDialog
          busy={busy}
          error={message}
          onCancel={() => setConfirmExit(false)}
          onConfirm={() => void leave("logout")}
        />
      )}
      <input
        ref={input}
        type="file"
        accept=".excalidraw,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
