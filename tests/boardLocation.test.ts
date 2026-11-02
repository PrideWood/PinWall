import test from "node:test";
import assert from "node:assert/strict";
import {
  boardFromUrl,
  libraryReturnUrl,
  loadedBoardUrl,
} from "../src/lib/boardLocation.js";

const board = "12345678-1234-1234-1234-123456789abc";
const other = "abcdefab-1234-1234-1234-123456789abc";
const base = "https://whiteboard.example.com/";
const library = "https://libraries.excalidraw.com/libraries/example.excalidrawlib";

test("library installation targets the current board and only changes its hash", () => {
  const editor = new URL(loadedBoardUrl(`${base}#${board}`, board));
  const referrer = libraryReturnUrl(editor.href, board);
  // The catalogue receives referrer inside the browse link's query string.
  const browse = new URL(`https://libraries.excalidraw.com?referrer=${referrer}&useHash=true`);
  const callback = new URL(browse.searchParams.get("referrer")!);
  callback.hash = new URLSearchParams({ addLibrary: library, token: "instance" }).toString();
  assert.equal(callback.origin + callback.pathname + callback.search,
    editor.origin + editor.pathname + editor.search);
  assert.equal(boardFromUrl(callback.href), board);
  assert.equal(loadedBoardUrl(callback.href, board), callback.href);
});

test("initial board loading preserves both current and legacy library callbacks", () => {
  for (const callback of [
    `${base}?board=${board}#addLibrary=${encodeURIComponent(library)}&token=instance`,
    `${base}?board=${board}&addLibrary=${encodeURIComponent(library)}`,
  ]) {
    const loaded = new URL(loadedBoardUrl(callback, board));
    assert.equal(boardFromUrl(loaded.href), board);
    assert.equal(new URLSearchParams(loaded.hash.slice(1)).get("addLibrary")
      || loaded.searchParams.get("addLibrary"), library);
  }
});

test("normal board navigation takes precedence over a previous library destination", () => {
  const url = `${base}?board=${board}#${other}`;
  assert.equal(boardFromUrl(url), other);
  const loaded = loadedBoardUrl(url, other);
  assert.equal(new URL(loaded).searchParams.get("board"), other);
  assert.equal(boardFromUrl(libraryReturnUrl(loaded, other)), other);
  assert.equal(boardFromUrl(`${base}?board=invalid#addLibrary=test`), null);
  assert.equal(boardFromUrl(base), null);
});
