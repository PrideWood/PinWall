const boardIdPattern = /^[0-9a-f-]{36}$/;

export function boardFromUrl(href: string): string | null {
  const url = new URL(href);
  const hashId = url.hash.slice(1);
  if (boardIdPattern.test(hashId)) return hashId;
  // Library callbacks use the hash themselves; keep the destination separately.
  const id = url.searchParams.get("board");
  return id && boardIdPattern.test(id) ? id : null;
}

export function libraryReturnUrl(href: string, boardId: string): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("board", boardId);
  return url.href;
}

export function loadedBoardUrl(href: string, boardId: string): string {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  // Match the catalogue's return URL so installation only changes the hash,
  // without reloading the editor or interrupting pending autosaves.
  url.searchParams.set("board", boardId);
  // Excalidraw must consume any callback after the async board load finishes.
  if (!hash.has("addLibrary") && !url.searchParams.has("addLibrary")) {
    url.hash = boardId;
  }
  return url.href;
}
