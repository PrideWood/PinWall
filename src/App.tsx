import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  Download,
  LockKeyhole,
  LogOut,
  Pencil,
  Plus,
  Shapes,
  Trash2,
} from "lucide-react";
import type { Board, Draft, LoadedBoard, Snapshot, User } from "./types/board";
import { api, ApiError } from "./lib/api";
import { clearDrafts, getDraft, removeDraft } from "./lib/drafts";
import { boardFromUrl, loadedBoardUrl } from "./lib/boardLocation";
import { PhonePage } from "./views/PhonePage";
import { ScanLogin } from "./views/ScanLogin";
import { RenameBoardDialog } from "./views/RenameBoardDialog";
import "./App.css";
const BoardEditor = lazy(() =>
  import("./views/BoardEditor").then((m) => ({ default: m.BoardEditor })),
);
const BoardViewer = lazy(() =>
  import("./views/BoardViewer").then((m) => ({ default: m.BoardViewer })),
);
type OpenBoard = {
  board: LoadedBoard;
  initial: Snapshot;
  draft?: Draft;
  recovered: boolean;
};
const boardFromLocation = () => boardFromUrl(location.href);
const emptyBoard: Board = {
  id: "empty",
  title: "白板",
  version: 0,
  created_at: "",
  updated_at: "",
};
const emptyScene: Snapshot = {
  scene: { elements: [], appState: { viewBackgroundColor: "#ffffff" } },
  files: {},
};
function Workspace() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [boards, setBoards] = useState<Board[]>([]);
  const [open, setOpen] = useState<OpenBoard | null>(null);
  const [listing, setListing] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [renaming, setRenaming] = useState<Board | null>(null);
  const [title, setTitle] = useState("");
  const channel = useRef<BroadcastChannel | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const rows = await api<Board[]>("/boards");
    setBoards(rows);
    return rows;
  }, []);
  const load = useCallback(async (id: string, owner: User | null) => {
    const current = ++generation.current;
    setBusy(true);
    setNotice("");
    try {
      const board = await api<LoadedBoard>(`/boards/${id}`);
      const { restoreImages } = await import("./lib/scene");
      const initial = await restoreImages(board);
      const draft = owner
        ? await getDraft(owner.id, id).catch(() => undefined)
        : undefined;
      if (current !== generation.current) return;
      setOpen({ board, initial, draft, recovered: false });
      setListing(false);
      history.replaceState(null, "", loadedBoardUrl(location.href, id));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }, []);
  const initialize = useCallback(async () => {
    setChecking(true);
    setNotice("");
    try {
      const me = await api<User>("/me").catch((error) => {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      });
      const rows = await refresh();
      const id = boardFromLocation() || rows[0]?.id;
      if (id) await load(id, me);
      setUser(me);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "白板暂时无法加载。");
    } finally {
      setChecking(false);
    }
  }, [load, refresh]);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  const visitor = useCallback(async () => {
    window.dispatchEvent(new Event("whiteboard-lock"));
    generation.current++;
    const id = boardFromLocation();
    setUser(null);
    setOpen(null);
    setLoginOpen(false);
    await clearDrafts().catch(() =>
      setNotice("本机草稿清理失败，共享电脑上请清除此站点数据。"),
    );
    try {
      const rows = await refresh();
      if (id || rows[0]) await load(id || rows[0].id, null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "白板加载失败。");
    }
  }, [load, refresh]);
  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const current = new BroadcastChannel("whiteboard-session");
    channel.current = current;
    current.onmessage = () => void visitor();
    return () => {
      current.close();
      channel.current = null;
    };
  }, [visitor]);
  async function unlock() {
    const me = await api<User>("/me");
    let rows = await refresh();
    if (!rows.length) {
      const board = await api<Board>("/boards", {
        method: "POST",
        body: JSON.stringify({ title: "我的白板" }),
      });
      rows = [board];
      setBoards(rows);
    }
    await load(open?.board.id || boardFromLocation() || rows[0].id, me);
    setUser(me);
  }
  async function logout() {
    await api("/auth/sign-out", { method: "POST", body: "{}" });
    channel.current?.postMessage("logout");
    await visitor();
  }
  const showError = (error: unknown) =>
    setNotice(error instanceof Error ? error.message : "操作失败。");
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setNotice("");
    try {
      const board = await api<Board>("/boards", {
        method: "POST",
        body: JSON.stringify({ title: title.trim() || "未命名白板" }),
      });
      setTitle("");
      await refresh();
      await load(board.id, user);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }
  async function renameBoard(board: Board, title: string) {
    if (!user) throw new Error("请先授权编辑。");
    const updated = await api<Board>(`/boards/${board.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    setBoards((rows) =>
      rows.map((row) => (row.id === board.id ? updated : row)),
    );
    setOpen((current) =>
      current?.board.id === board.id
        ? { ...current, board: { ...current.board, ...updated } }
        : current,
    );
    setRenaming(null);
  }
  async function deleteBoard(board: Board) {
    if (!user) return;
    if (!confirm(`永久删除“${board.title}”及其中的图片？`)) return;
    setBusy(true);
    setNotice("");
    try {
      await api(`/boards/${board.id}`, {
        method: "DELETE",
      });
      await removeDraft(user.id, board.id);
      if (open?.board.id === board.id) setOpen(null);
      await refresh();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }
  const login = loginOpen ? (
    <ScanLogin onClose={() => setLoginOpen(false)} onSuccess={unlock} />
  ) : null;
  if (checking)
    return (
      <div className="center-state">
        <span className="spinner" />
        <p>正在打开白板…</p>
      </div>
    );
  if (open?.draft && user)
    return (
      <>
        <main className="center-state">
          <section className="recovery-card">
            <span className="eyebrow">LOCAL RECOVERY</span>
            <h1>发现未同步的草稿</h1>
            <p>保存于 {new Date(open.draft.savedAt).toLocaleString("zh-CN")}</p>
            {open.draft.version !== open.board.version && (
              <div className="notice">
                云端已变化，请先导出草稿，再加载云端版本。
              </div>
            )}
            <div className="recovery-actions">
              <button
                onClick={async () => {
                  const { downloadSnapshot } = await import("./lib/scene");
                  downloadSnapshot(
                    open.draft!.snapshot,
                    `${open.board.title}-草稿`,
                  );
                }}
              >
                <Download size={16} />
                导出草稿
              </button>
              {open.draft.version === open.board.version && (
                <button
                  className="primary"
                  onClick={() =>
                    setOpen({
                      ...open,
                      initial: open.draft!.snapshot,
                      draft: undefined,
                      recovered: true,
                    })
                  }
                >
                  恢复并同步
                </button>
              )}
              <button
                onClick={async () => {
                  if (!confirm("放弃此本地草稿，加载云端版本？")) return;
                  await removeDraft(user.id, open.board.id);
                  setOpen({ ...open, draft: undefined });
                }}
              >
                使用云端版本
              </button>
              <button
                onClick={() => {
                  setOpen(null);
                  setListing(true);
                }}
              >
                返回列表
              </button>
            </div>
          </section>
        </main>
      </>
    );
  const reload = () => {
    if (open) void load(open.board.id, user).catch(showError);
  };
  const back = () => {
    setListing(true);
    void refresh().catch(showError);
  };
  if (!listing)
    return (
      <>
        {notice && (
          <div className="workspace-error" role="alert">
            {notice}
            <button onClick={() => void initialize()}>重试</button>
          </div>
        )}
        <Suspense fallback={<div className="center-state">正在打开画布…</div>}>
          {open && user ? (
            <BoardEditor
              key={`${open.board.id}:${open.board.version}`}
              user={user}
              board={open.board}
              initial={open.initial}
              recovered={open.recovered}
              uploaded={open.board.images.map((i) => i.file_id)}
              onBack={back}
              onLogout={logout}
              onReload={reload}
            />
          ) : (
            <BoardViewer
              board={open?.board || emptyBoard}
              initial={open?.initial || emptyScene}
              onBack={back}
              onEdit={() => setLoginOpen(true)}
              onReload={() => (open ? reload() : void initialize())}
            />
          )}
        </Suspense>
        {login}
      </>
    );
  return (
    <div className="library-page">
      <header className="library-header">
        <button className="wordmark quiet" onClick={() => setListing(false)}>
          <Shapes size={24} />
          白板
        </button>
        {user ? (
          <button
            className="quiet"
            onClick={() => void logout().catch(showError)}
            disabled={busy}
          >
            <LogOut size={16} />
            退出编辑
          </button>
        ) : (
          <button className="quiet" onClick={() => setLoginOpen(true)}>
            <LockKeyhole size={16} />
            手机授权编辑
          </button>
        )}
      </header>
      <main className="library-main">
        <div className="library-heading">
          <div>
            <span className="eyebrow">A SPACE FOR YOUR NEXT IDEA</span>
            <h1>
              {user ? "我的白板" : "白板"}
              <span className="count">
                {boards.length.toString().padStart(2, "0")}
              </span>
            </h1>
            <p>
              {user
                ? "画下来，保存好，下次接着想。"
                : "访客可以查看，编辑需要手机授权。"}
            </p>
          </div>
        </div>
        {user && (
          <form
            className="create-form"
            onSubmit={(event) => void create(event)}
          >
            <Plus size={20} />
            <input
              aria-label="新白板名称"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="给新的想法起个名字…"
            />
            <button className="primary" disabled={busy}>
              新建白板
              <ArrowRight size={16} />
            </button>
          </form>
        )}
        {notice && (
          <div className="notice" role="alert">
            {notice}
          </div>
        )}
        <div className="boards-grid">
          {boards.map((board, index) => (
            <article className="board-card" key={board.id}>
              <button
                className={`board-cover tone-${index % 4}`}
                onClick={() => void load(board.id, user).catch(showError)}
                disabled={busy}
                aria-label={`打开 ${board.title}`}
              >
                <span className="cover-number">
                  {(index + 1).toString().padStart(2, "0")}
                </span>
                <Shapes className="cover-shape" size={66} strokeWidth={1} />
                <span className="open-label">打开白板 ↗</span>
              </button>
              <div className="board-info">
                <button
                  className="board-name"
                  onClick={() => void load(board.id, user).catch(showError)}
                  disabled={busy}
                >
                  {board.title}
                </button>
                <div className="board-meta">
                  <span>
                    {new Date(board.updated_at).toLocaleDateString("zh-CN")}{" "}
                    更新
                  </span>
                  {user && (
                    <div>
                      <button
                        className="icon-button"
                        aria-label={`重命名 ${board.title}`}
                        onClick={() => setRenaming(board)}
                        disabled={busy}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button delete"
                        aria-label={`删除 ${board.title}`}
                        onClick={() => void deleteBoard(board)}
                        disabled={busy}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        {!boards.length && (
          <div className="empty-state">
            <Shapes size={42} />
            <h2>从一块白板开始。</h2>
            {!user && (
              <button className="primary" onClick={() => setLoginOpen(true)}>
                手机扫码编辑
              </button>
            )}
          </div>
        )}
        {busy && (
          <p className="loading-note" role="status">
            正在处理…
          </p>
        )}
      </main>
      {login}
      {renaming && user && (
        <RenameBoardDialog
          key={renaming.id}
          title={renaming.title}
          onClose={() => setRenaming(null)}
          onSave={(title) => renameBoard(renaming, title)}
        />
      )}
    </div>
  );
}
function App() {
  return location.pathname === "/phone" ? <PhonePage /> : <Workspace />;
}
export default App;
