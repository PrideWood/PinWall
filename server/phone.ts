import { createHash, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "./db.js";
import { appOrigin, ownerEmail } from "./config.js";
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("hex");
const phoneCookie = "whiteboard-phone";
const browserCookie = "whiteboard-device";
export class ApprovalError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function cookieValue(headers: Headers, name: string) {
  return (
    (headers.get("cookie") || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}
function setCookie(name: string, token: string, age: number) {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${appOrigin().startsWith("https:") ? "; Secure" : ""}`;
}
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
async function throttle(headers: Headers, action: string, limit: number) {
  const key = hashToken(
    `${action}:${headers.get("x-whiteboard-client-ip") || "local"}`,
  );
  const result = await db().query(
    `INSERT INTO auth_throttles(bucket,count,resets_at) VALUES($1,1,now()+interval '10 minutes')
    ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN auth_throttles.resets_at<now() THEN 1 ELSE auth_throttles.count+1 END,
    resets_at=CASE WHEN auth_throttles.resets_at<now() THEN now()+interval '10 minutes' ELSE auth_throttles.resets_at END RETURNING count`,
    [key],
  );
  if (result.rows[0].count > limit)
    throw new ApprovalError(429, "尝试次数过多，请稍后再试。");
}
export async function trustedPhone(headers: Headers) {
  const value = cookieValue(headers, phoneCookie);
  if (!tokenSchema.safeParse(value).success) return null;
  const { rows } = await db().query(
    `SELECT p.id,p.owner_id,p.expires_at FROM trusted_phones p JOIN "user" u ON u.id=p.owner_id
    WHERE p.token_hash=$1 AND p.revoked_at IS NULL AND p.expires_at>now() AND lower(u.email)=$2`,
    [hashToken(value), ownerEmail()],
  );
  return rows[0] || null;
}
function deviceLabel(agent: string) {
  const os = /Windows/i.test(agent)
    ? "Windows 电脑"
    : /Macintosh/i.test(agent)
      ? "Mac 电脑"
      : /Android/i.test(agent)
        ? "Android 设备"
        : /iPhone|iPad/i.test(agent)
          ? "iPhone / iPad"
          : "浏览器";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Chrome\//.test(agent)
      ? "Chrome"
      : /Safari\//.test(agent)
        ? "Safari"
        : "网页";
  return `${os} · ${browser}`;
}
export async function claimApprovedRequest(body: unknown, headers: Headers) {
  const { id, secret } = z
    .object({ id: z.string().uuid(), secret: tokenSchema })
    .parse(body);
  const browser = cookieValue(headers, browserCookie);
  const { rows } = await db().query(
    `UPDATE edit_requests SET state='consumed' WHERE id=$1 AND secret_hash=$2 AND browser_hash=$3
    AND state='approved' AND expires_at>now() AND owner_id IN (SELECT id FROM "user" WHERE lower(email)=$4) RETURNING owner_id`,
    [id, hashToken(secret), hashToken(browser), ownerEmail()],
  );
  if (!rows[0])
    throw new ApprovalError(403, "授权无效、已过期或已被领取，请重新扫码。");
  return rows[0].owner_id as string;
}
export async function phoneRoutes(request: Request): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/phone/") && !path.startsWith("/api/edit-requests"))
    return null;
  if (path === "/api/phone/status" && request.method === "GET") {
    const phone = await trustedPhone(request.headers);
    return json({ trusted: !!phone, expiresAt: phone?.expires_at });
  }
  if (path === "/api/phone/pair" && request.method === "POST") {
    await throttle(request.headers, "pair", 10);
    const { token } = z
      .object({ token: tokenSchema })
      .parse(await request.json());
    const client = await db().connect();
    const credential = newToken();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `UPDATE phone_pairings SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now()
        AND owner_id IN (SELECT id FROM "user" WHERE lower(email)=$2) RETURNING owner_id`,
        [hashToken(token), ownerEmail()],
      );
      if (!rows[0])
        throw new ApprovalError(
          403,
          "绑定链接无效或已过期，请在可信电脑重新生成。",
        );
      await client.query(
        `INSERT INTO trusted_phones(owner_id,token_hash,expires_at) VALUES($1,$2,now()+interval '180 days')`,
        [rows[0].owner_id, hashToken(credential)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const response = json({ trusted: true });
    response.headers.set(
      "Set-Cookie",
      setCookie(phoneCookie, credential, 180 * 86400),
    );
    return response;
  }
  if (path === "/api/phone/revoke" && request.method === "POST") {
    const phone = await trustedPhone(request.headers);
    if (phone) {
      await db().query(
        "UPDATE trusted_phones SET revoked_at=now() WHERE id=$1",
        [phone.id],
      );
      await db().query('DELETE FROM session WHERE "trustedPhoneId"=$1', [
        phone.id,
      ]);
    }
    const response = json({ trusted: false });
    response.headers.set("Set-Cookie", setCookie(phoneCookie, "", 0));
    return response;
  }
  if (path === "/api/edit-requests" && request.method === "POST") {
    await throttle(request.headers, "request", 20);
    const { rows: owners } = await db().query(
      'SELECT id FROM "user" WHERE lower(email)=$1',
      [ownerEmail()],
    );
    if (!owners[0])
      throw new ApprovalError(
        503,
        "手机尚未绑定，请先在可信电脑运行 npm run phone:pair。",
      );
    let browser = cookieValue(request.headers, browserCookie);
    if (!tokenSchema.safeParse(browser).success) browser = newToken();
    const scan = newToken(),
      secret = newToken(),
      code = randomInt(100000, 1000000).toString();
    await db().query(
      "DELETE FROM edit_requests WHERE expires_at<now()-interval '1 hour'",
    );
    const { rows } = await db().query(
      `INSERT INTO edit_requests(scan_hash,secret_hash,browser_hash,check_code,device_label,expires_at)
      VALUES($1,$2,$3,$4,$5,now()+interval '3 minutes') RETURNING id,expires_at`,
      [
        hashToken(scan),
        hashToken(secret),
        hashToken(browser),
        code,
        deviceLabel(request.headers.get("user-agent") || ""),
      ],
    );
    const response = json({
      id: rows[0].id,
      secret,
      code,
      expiresAt: rows[0].expires_at,
      url: `${appOrigin()}/phone#request=${scan}`,
    });
    response.headers.set("Set-Cookie", setCookie(browserCookie, browser, 600));
    return response;
  }
  if (path === "/api/edit-requests/status" && request.method === "POST") {
    const { id, secret } = z
      .object({ id: z.string().uuid(), secret: tokenSchema })
      .parse(await request.json());
    const { rows } = await db().query(
      `UPDATE edit_requests SET next_poll_at=now()+interval '1 second' WHERE id=$1 AND secret_hash=$2 AND browser_hash=$3
      AND next_poll_at<=now() RETURNING state,expires_at`,
      [
        id,
        hashToken(secret),
        hashToken(cookieValue(request.headers, browserCookie)),
      ],
    );
    if (!rows[0]) throw new ApprovalError(429, "请求无效或查询过快。");
    return json({
      state:
        new Date(rows[0].expires_at).getTime() < Date.now()
          ? "expired"
          : rows[0].state,
    });
  }
  if (
    (path === "/api/phone/request" || path === "/api/phone/approve") &&
    request.method === "POST"
  ) {
    const phone = await trustedPhone(request.headers);
    if (!phone)
      throw new ApprovalError(401, "此手机尚未绑定或身份已过期，请先绑定。");
    const body = z
      .object({
        token: tokenSchema,
        code: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
        allow: z.boolean().optional(),
      })
      .parse(await request.json());
    const { rows } = await db().query(
      "SELECT id,check_code,device_label,state,expires_at FROM edit_requests WHERE scan_hash=$1 AND expires_at>now()",
      [hashToken(body.token)],
    );
    const ticket = rows[0];
    if (!ticket)
      throw new ApprovalError(410, "此二维码已过期，请在电脑重新生成。");
    if (path === "/api/phone/request")
      return json({
        code: ticket.check_code,
        device: ticket.device_label,
        state: ticket.state,
        expiresAt: ticket.expires_at,
      });
    if (body.code !== ticket.check_code || body.allow === undefined)
      throw new ApprovalError(400, "请核对电脑上的六位授权码。");
    const updated = await db().query(
      "UPDATE edit_requests SET state=$1,owner_id=$2 WHERE id=$3 AND state='pending' AND expires_at>now() RETURNING id",
      [body.allow ? "approved" : "denied", phone.owner_id, ticket.id],
    );
    if (!updated.rowCount)
      throw new ApprovalError(409, "此请求已经处理或已过期。");
    return json({ state: body.allow ? "approved" : "denied" });
  }
  throw new ApprovalError(404, "接口不存在。");
}
