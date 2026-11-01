import type { IncomingMessage, ServerResponse } from "node:http";
import { handleRequest } from "./app.js";
export async function nodeHandler(req: IncomingMessage, res: ServerResponse) {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > 4 * 1024 * 1024) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: "请求过大，请减少白板内容或压缩图片。" }),
        );
        return;
      }
      chunks.push(Buffer.from(chunk));
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
      else if (value) headers.set(name, value);
    }
    headers.set(
      "x-whiteboard-client-ip",
      process.env.VERCEL
        ? String(
            req.headers["x-vercel-forwarded-for"] ||
              req.socket.remoteAddress ||
              "unknown",
          )
        : req.socket.remoteAddress || "local",
    );
    // Use a configured, trusted origin, never a caller-controlled Host for auth URLs.
    const origin = process.env.APP_URL || "http://localhost:5173";
    const url = new URL(req.url || "/", origin);
    const parsedBody = (req as IncomingMessage & { body?: unknown }).body;
    const body = chunks.length
      ? Buffer.concat(chunks)
      : parsedBody === undefined
        ? Buffer.alloc(0)
        : Buffer.isBuffer(parsedBody)
          ? parsedBody
          : Buffer.from(
              typeof parsedBody === "string"
                ? parsedBody
                : JSON.stringify(parsedBody),
            );
    if (body.length > 4 * 1024 * 1024) {
      res.writeHead(413);
      res.end();
      return;
    }
    const request = new Request(url, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method || "GET")
        ? undefined
        : Uint8Array.from(body).buffer,
    });
    const response = await handleRequest(request);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") res.setHeader(name, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "服务器请求失败。" }));
  }
}
