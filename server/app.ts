import { phoneRoutes, ApprovalError } from "./phone.js";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "./auth.js";
import { appOrigin, ownerEmail } from "./config.js";
import { db } from "./db.js";
import { putImage, readImage, deleteImages } from "./storage.js";
import {
  fileIdSchema,
  imageMime,
  maxImageBytes,
  referencedImages,
  saveSchema,
  titleSchema,
} from "./validation.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const uuid = z.string().uuid();
async function ownedBoard(id: string, owner: string) {
  const { rows } = await db().query(
    "SELECT * FROM boards WHERE id=$1 AND owner_id=$2",
    [id, owner],
  );
  if (!rows[0]) throw new HttpError(404, "白板不存在。");
  return rows[0];
}
export async function collectGarbage() {
  const { rows } = await db().query(
    "SELECT storage_key FROM storage_garbage ORDER BY created_at LIMIT 100",
  );
  if (!rows.length) return;
  await deleteImages(rows.map((r) => r.storage_key));
  await db().query(
    "DELETE FROM storage_garbage WHERE storage_key=ANY($1::text[])",
    [rows.map((r) => r.storage_key)],
  );
}
async function routes(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  if (path === "/api/health") return json({ ok: true });
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("origin") !== appOrigin()
  ) {
    throw new HttpError(403, "请求来源无效。");
  }
  const phoneResponse = await phoneRoutes(request);
  if (phoneResponse) return phoneResponse;
  if (
    ["/api/auth/sign-out", "/api/auth/owner/claim-edit"].includes(path) &&
    request.method === "POST"
  )
    return auth().handler(request);
  if (path.startsWith("/api/auth/") || path === "/api/owner/login")
    throw new HttpError(404, "接口不存在。");
  const session = await auth().api.getSession({ headers: request.headers });
  if (session && session.user.email.toLowerCase() !== ownerEmail())
    throw new HttpError(403, "此账号没有编辑权限。");
  if (path === "/api/me" && request.method === "GET") {
    if (!session) throw new HttpError(401, "当前为访客，只能查看白板。");
    return json({ id: session.user.id });
  }
  const publicRead =
    request.method === "GET" && /^\/api\/boards(?:\/|$)/.test(path);
  if (!session && !publicRead)
    throw new HttpError(401, "请输入密码后编辑白板。");
  let owner = session?.user.id;
  if (!owner) {
    const { rows } = await db().query(
      'SELECT id FROM "user" WHERE lower(email)=$1 LIMIT 1',
      [ownerEmail()],
    );
    owner = rows[0]?.id as string | undefined;
  }
  if (!owner) {
    if (path === "/api/boards" && request.method === "GET") return json([]);
    throw new HttpError(404, "暂无可查看的白板。");
  }
  if (path === "/api/boards") {
    if (request.method === "GET") {
      const { rows } = await db().query(
        "SELECT id,title,version,created_at,updated_at FROM boards WHERE owner_id=$1 ORDER BY updated_at DESC",
        [owner],
      );
      return json(rows);
    }
    if (request.method === "POST") {
      const { title } = titleSchema.parse(await request.json());
      const { rows } = await db().query(
        "INSERT INTO boards(owner_id,title) VALUES($1,$2) RETURNING id,title,version,created_at,updated_at",
        [owner, title],
      );
      return json(rows[0], 201);
    }
  }
  const match = path.match(/^\/api\/boards\/([^/]+)(?:\/images\/([^/]+))?$/);
  if (!match) throw new HttpError(404, "接口不存在。");
  const id = uuid.parse(match[1]);
  const fileId = match[2] && fileIdSchema.parse(match[2]);
  if (fileId) {
    const imageBoard = await ownedBoard(id, owner);
    if (request.method === "GET") {
      // Visitors may read only images referenced by the current saved scene.
      if (
        !session &&
        !referencedImages(imageBoard.scene_json.elements).includes(fileId)
      )
        throw new HttpError(404, "图片不存在。");
      const { rows } = await db().query(
        "SELECT storage_key,mime_type FROM board_images WHERE board_id=$1 AND owner_id=$2 AND file_id=$3",
        [id, owner, fileId],
      );
      if (!rows[0]) throw new HttpError(404, "图片不存在。");
      const bytes = await readImage(rows[0].storage_key);
      return new Response(Buffer.from(bytes), {
        headers: {
          "Content-Type": rows[0].mime_type,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (request.method === "PUT") {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.length > maxImageBytes)
        throw new HttpError(413, "单张图片最大 3 MB。");
      const mime = imageMime(bytes);
      if (!mime)
        throw new HttpError(
          400,
          "支持 PNG、JPEG、GIF 和 WebP 图片，单张最大 3 MB。",
        );
      const hash = createHash("sha256").update(bytes).digest("hex");
      const client = await db().connect();
      let uploadedKey: string | null = null;
      try {
        await client.query("BEGIN");
        const board = await client.query(
          "SELECT id FROM boards WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [id, owner],
        );
        if (!board.rowCount) throw new HttpError(404, "白板不存在。");
        const existing = await client.query(
          "SELECT content_hash FROM board_images WHERE board_id=$1 AND file_id=$2",
          [id, fileId],
        );
        if (existing.rowCount) {
          if (existing.rows[0].content_hash !== hash)
            throw new HttpError(409, "图片标识冲突，请重新插入图片。");
        } else {
          const key = `${owner}/${id}/${randomUUID()}`;
          await putImage(key, bytes, mime);
          uploadedKey = key;
          await client.query(
            "INSERT INTO board_images(board_id,owner_id,file_id,storage_key,mime_type,file_size,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [id, owner, fileId, key, mime, bytes.length, hash],
          );
        }
        await client.query("COMMIT");
        return json({ fileId });
      } catch (error) {
        await client.query("ROLLBACK");
        if (uploadedKey)
          await db()
            .query(
              "INSERT INTO storage_garbage(storage_key) VALUES($1) ON CONFLICT DO NOTHING",
              [uploadedKey],
            )
            .catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    throw new HttpError(405, "不支持的操作。");
  }
  if (request.method === "GET") {
    const board = await ownedBoard(id, owner);
    const { rows: images } = await db().query(
      "SELECT file_id,mime_type,created_at FROM board_images WHERE board_id=$1 AND owner_id=$2",
      [id, owner],
    );
    const scene = session
      ? board.scene_json
      : {
          ...board.scene_json,
          elements: board.scene_json.elements.filter(
            (element: { isDeleted?: boolean }) => !element.isDeleted,
          ),
        };
    const visibleIds = referencedImages(scene.elements);
    return json({
      id: board.id,
      title: board.title,
      version: board.version,
      created_at: board.created_at,
      updated_at: board.updated_at,
      scene_json: scene,
      images: session
        ? images
        : images.filter((image) => visibleIds.includes(image.file_id)),
    });
  }
  if (request.method === "PATCH") {
    const { title } = titleSchema.parse(await request.json());
    const { rows } = await db().query(
      "UPDATE boards SET title=$1,version=version+1,updated_at=now() WHERE id=$2 AND owner_id=$3 RETURNING id,title,version,created_at,updated_at",
      [title, id, owner],
    );
    if (!rows[0]) throw new HttpError(404, "白板不存在。");
    return json(rows[0]);
  }
  if (request.method === "PUT") {
    const { scene, version } = saveSchema.parse(await request.json());
    const refs = referencedImages(scene.elements);
    if (refs.length) {
      const { rows } = await db().query(
        "SELECT file_id FROM board_images WHERE board_id=$1 AND owner_id=$2 AND file_id=ANY($3::text[])",
        [id, owner, refs],
      );
      if (rows.length !== refs.length)
        throw new HttpError(400, "图片尚未上传完成，白板未保存。");
    }
    const { rows } = await db().query(
      "UPDATE boards SET scene_json=$1,version=version+1,updated_at=now() WHERE id=$2 AND owner_id=$3 AND version=$4 RETURNING version,updated_at",
      [JSON.stringify(scene), id, owner, version],
    );
    if (!rows[0]) {
      await ownedBoard(id, owner);
      throw new HttpError(
        409,
        "另一设备已更新此白板。请导出本地副本，然后加载云端版本。",
      );
    }
    return json(rows[0]);
  }
  if (request.method === "DELETE") {
    const client = await db().connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT id FROM boards WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [id, owner],
      );
      if (!result.rowCount) throw new HttpError(404, "白板不存在。");
      await client.query(
        "INSERT INTO storage_garbage(storage_key) SELECT storage_key FROM board_images WHERE board_id=$1 ON CONFLICT DO NOTHING",
        [id],
      );
      await client.query("DELETE FROM boards WHERE id=$1 AND owner_id=$2", [
        id,
        owner,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    // The durable queue retains failed deletions for the cleanup script.
    await collectGarbage().catch(() => {});
    return json({ deleted: true });
  }
  throw new HttpError(405, "不支持的操作。");
}
export async function handleRequest(request: Request): Promise<Response> {
  try {
    const response = await routes(request);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    if (error instanceof HttpError || error instanceof ApprovalError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "提交的数据格式不正确。" }, 400);
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Missing server configuration:"))
      return json(
        { error: "云端服务尚未配置，请按照 README 完成服务器环境配置。" },
        503,
      );
    console.error(
      "API request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json({ error: "云端暂时不可用，请稍后重试。" }, 500);
  }
}
