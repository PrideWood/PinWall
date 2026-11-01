import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { hashToken } from "../server/phone.js";
import { getMigrations } from "better-auth/db/migration";
import { auth, createAuth } from "../server/auth.js";
import { db } from "../server/db.js";
import { nodeHandler } from "../server/node.js";

test(
  "phone pairing, browser-bound approval, public viewing, owner-only writes and cloud persistence",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const connection = new URL(process.env.TEST_DATABASE_URL!);
    assert.equal(
      connection.hostname,
      "127.0.0.1",
      "Integration test may only use the disposable local database.",
    );
    process.env.DATABASE_URL = connection.href;
    process.env.APP_URL = "http://localhost:5173";
    process.env.OWNER_EMAIL = "owner@example.test";
    process.env.BETTER_AUTH_SECRET =
      "test-only-secret-58bbef07bba547de9bbddc399a8c1f19";
    const objects = new Map<string, Buffer>();
    const storage = createServer(async (req, res) => {
      const path = new URL(req.url!, "http://localhost").pathname;
      const parts: Buffer[] = [];
      for await (const chunk of req) parts.push(Buffer.from(chunk));
      const body = Buffer.concat(parts);
      if (req.method === "PUT") {
        objects.set(path, body);
        res.writeHead(200, { ETag: '"test"' });
        res.end();
      } else if (req.method === "GET") {
        const value = objects.get(path);
        if (!value) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Length": value.length });
        res.end(value);
      } else if (req.method === "POST" && req.url?.includes("delete")) {
        for (const match of body.toString().matchAll(/<Key>([^<]+)<\/Key>/g))
          objects.delete(`/test/${match[1]}`);
        res.writeHead(200, { "Content-Type": "application/xml" });
        res.end(
          '<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></DeleteResult>',
        );
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) =>
      storage.listen(0, "127.0.0.1", resolve),
    );
    process.env.S3_ENDPOINT = `http://127.0.0.1:${(storage.address() as { port: number }).port}`;
    process.env.S3_REGION = "auto";
    process.env.S3_BUCKET = "test";
    process.env.S3_ACCESS_KEY_ID = "local-test";
    process.env.S3_SECRET_ACCESS_KEY = "local-test";
    const apiServer = createServer(nodeHandler);
    await new Promise<void>((resolve) =>
      apiServer.listen(0, "127.0.0.1", resolve),
    );
    const apiOrigin = `http://127.0.0.1:${(apiServer.address() as { port: number }).port}`;
    async function request(
      path: string,
      method = "GET",
      cookie = "",
      body?: unknown,
    ) {
      const headers = new Headers({ origin: process.env.APP_URL!, cookie });
      if (body && !(body instanceof Buffer))
        headers.set("Content-Type", "application/json");
      return fetch(`${apiOrigin}/api${path}`, {
        method,
        headers,
        body:
          body instanceof Buffer
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
      });
    }
    try {
      await (await getMigrations(auth().options)).runMigrations();
      const migration = await readFile(
        new URL("../migrations/001-boards.sql", import.meta.url),
        "utf8",
      );
      await db().query(migration);
      await db().query(migration); // reruns must preserve existing records
      await db().query(
        await readFile(
          new URL("../migrations/002-phone-approval.sql", import.meta.url),
          "utf8",
        ),
      );
      assert.equal((await request("/boards")).status, 200);
      assert.equal(
        (
          await request("/auth/sign-up/email", "POST", "", {
            email: "owner@example.test",
            password: "qa6!ok",
            name: "Owner",
          })
        ).ok,
        false,
      );
      await assert.rejects(
        createAuth(true).api.signUpEmail({
          body: {
            email: "owner@example.test",
            password: "short",
            name: "Owner",
          },
        }),
        "Passwords shorter than six characters must be rejected",
      );
      await createAuth(true).api.signUpEmail({
        body: {
          email: "owner@example.test",
          password: "qa6!ok",
          name: "Owner",
        },
      });
      const owner = await db().query('SELECT id FROM "user" WHERE email=$1', [
        "owner@example.test",
      ]);
      const pairing = randomBytes(32).toString("hex");
      await db().query(
        "INSERT INTO phone_pairings(token_hash,owner_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
        [hashToken(pairing), owner.rows[0].id],
      );
      const cookies = (response: Response) =>
        response.headers
          .getSetCookie()
          .map((c) => c.split(";")[0])
          .join("; ");
      const paired = await request("/phone/pair", "POST", "", {
        token: pairing,
      });
      assert.equal(paired.status, 200);
      const phone = cookies(paired);
      assert.equal(
        (await request("/phone/pair", "POST", "", { token: pairing })).status,
        403,
        "Pairing links are single-use",
      );
      assert.equal((await request("/phone/status", "GET", phone)).status, 200);
      assert.equal(
        (await request("/me", "GET", phone)).status,
        401,
        "A trusted phone is not automatically an editor",
      );
      assert.equal(
        (await request("/owner/login", "POST", "", { password: "qa6!ok" }))
          .status,
        404,
        "Password login is not exposed",
      );
      async function login() {
        const started = await request("/edit-requests", "POST");
        assert.equal(started.status, 200);
        const challenge = await started.json();
        const browser = cookies(started);
        const token = new URLSearchParams(
          new URL(challenge.url).hash.slice(1),
        ).get("request");
        const proof = { id: challenge.id, secret: challenge.secret };
        assert.equal(
          (await request("/auth/owner/claim-edit", "POST", browser, proof))
            .status,
          403,
          "Cannot claim before phone approval",
        );
        assert.equal(
          (
            await request("/phone/approve", "POST", "", {
              token,
              code: challenge.code,
              allow: true,
            })
          ).status,
          401,
          "Visitors cannot approve",
        );
        assert.equal(
          (
            await request("/phone/approve", "POST", phone, {
              token,
              code: "000000",
              allow: true,
            })
          ).status,
          400,
          "Phone must confirm displayed code",
        );
        const details = await (
          await request("/phone/request", "POST", phone, { token })
        ).json();
        assert.equal(details.code, challenge.code);
        assert.equal(
          (
            await request("/phone/approve", "POST", phone, {
              token,
              code: challenge.code,
              allow: true,
            })
          ).status,
          200,
        );
        assert.equal(
          (await request("/auth/owner/claim-edit", "POST", "", proof)).status,
          403,
          "Approval is bound to the requesting browser",
        );
        const granted = await request(
          "/auth/owner/claim-edit",
          "POST",
          browser,
          proof,
        );
        assert.equal(granted.status, 200, await granted.clone().text());
        assert.equal(
          (await request("/auth/owner/claim-edit", "POST", browser, proof))
            .status,
          403,
          "Approval cannot be replayed",
        );
        const editor = cookies(granted);
        assert.ok(editor);
        const me = await (await request("/me", "GET", editor)).json();
        assert.equal(
          me.email,
          undefined,
          "No owner email is returned to the frontend",
        );
        return editor;
      }
      const a = await login(),
        b = await login();
      assert.notEqual(a, b);
      const created = await request("/boards", "POST", a, {
        title: "跨设备测试",
      });
      assert.equal(created.status, 201);
      const board = await created.json();
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=",
        "base64",
      );
      assert.equal(
        (await request(`/boards/${board.id}/images/testimage`, "PUT", "", png))
          .status,
        401,
      );
      assert.equal(
        (await request(`/boards/${board.id}/images/testimage`, "PUT", a, png))
          .status,
        200,
      );
      const scene = {
        elements: [
          {
            id: "image-element",
            type: "image",
            fileId: "testimage",
            isDeleted: false,
          },
        ],
        appState: { viewBackgroundColor: "#ffffff" },
      };
      assert.equal(
        (await request(`/boards/${board.id}`, "PUT", a, { version: 0, scene }))
          .status,
        200,
      );
      const visitor = await (await request(`/boards/${board.id}`)).json();
      assert.equal(visitor.owner_id, undefined);
      assert.equal(visitor.scene_json.elements[0].type, "image");
      for (const method of ["PUT", "PATCH", "DELETE"]) {
        assert.equal(
          (
            await request(`/boards/${board.id}`, method, "", {
              version: 1,
              scene,
              title: "attack",
            })
          ).status,
          401,
        );
      }
      assert.equal(
        (await request("/boards", "POST", "", { title: "attack" })).status,
        401,
      );
      const onB = await (await request(`/boards/${board.id}`, "GET", b)).json();
      assert.equal(onB.version, 1);
      assert.equal(onB.images[0].file_id, "testimage");
      const image = await request(
        `/boards/${board.id}/images/testimage`,
        "GET",
        b,
      );
      assert.equal(image.status, 200);
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
      assert.match(image.headers.get("Cache-Control")!, /no-store/);
      assert.equal(
        (await request(`/boards/${board.id}/images/unused`, "PUT", a, png))
          .status,
        200,
      );
      assert.equal(
        (await request(`/boards/${board.id}/images/unused`)).status,
        404,
        "Unpublished and deleted image data stays private",
      );
      assert.equal(
        (await (await request(`/boards/${board.id}`)).json()).images.length,
        1,
      );
      // Both devices edit revision 1; exactly one must win.
      const results = await Promise.all([
        request(`/boards/${board.id}`, "PUT", a, { version: 1, scene }),
        request(`/boards/${board.id}`, "PUT", b, { version: 1, scene }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (await request(`/boards/${board.id}/images/testimage`)).status,
        200,
      );
      const deniedStart = await request("/edit-requests", "POST");
      const deniedTicket = await deniedStart.json();
      const deniedToken = new URLSearchParams(
        new URL(deniedTicket.url).hash.slice(1),
      ).get("request");
      assert.equal(
        (
          await request("/phone/approve", "POST", phone, {
            token: deniedToken,
            code: deniedTicket.code,
            allow: false,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/auth/owner/claim-edit",
            "POST",
            cookies(deniedStart),
            { id: deniedTicket.id, secret: deniedTicket.secret },
          )
        ).status,
        403,
      );
      const expiredStart = await request("/edit-requests", "POST");
      const expiredTicket = await expiredStart.json();
      const expiredToken = new URLSearchParams(
        new URL(expiredTicket.url).hash.slice(1),
      ).get("request");
      await db().query(
        "UPDATE edit_requests SET expires_at=now()-interval '1 second' WHERE id=$1",
        [expiredTicket.id],
      );
      assert.equal(
        (
          await request("/phone/request", "POST", phone, {
            token: expiredToken,
          })
        ).status,
        410,
      );
      assert.equal(
        (
          await request(
            "/auth/owner/claim-edit",
            "POST",
            cookies(expiredStart),
            { id: expiredTicket.id, secret: expiredTicket.secret },
          )
        ).status,
        403,
      );
      assert.equal(
        (await request("/phone/revoke", "POST", phone, {})).status,
        200,
      );
      assert.equal(
        (await (await request("/phone/status", "GET", phone)).json()).trusted,
        false,
      );
      assert.equal(
        (await request("/phone/request", "POST", phone, { token: deniedToken }))
          .status,
        401,
      );
      await db().query('UPDATE "user" SET email=$1 WHERE email=$2', [
        "other@example.test",
        "owner@example.test",
      ]);
      assert.equal(
        (await request(`/boards/${board.id}`, "GET", b)).status,
        403,
      );
      await db().query('UPDATE "user" SET email=$1 WHERE email=$2', [
        "owner@example.test",
        "other@example.test",
      ]);
      assert.equal(
        (await request(`/boards/${board.id}`, "DELETE", b)).status,
        200,
      );
      assert.equal(objects.size, 0);
      assert.equal(
        (await request(`/boards/${board.id}`, "GET", b)).status,
        404,
      );
      assert.equal(
        (await request("/auth/sign-out", "POST", a, {})).status,
        200,
      );
      assert.equal((await request("/me", "GET", a)).status, 401);
    } finally {
      await new Promise<void>((resolve) => apiServer.close(() => resolve()));
      await db().end();
      await new Promise<void>((resolve) => storage.close(() => resolve()));
    }
  },
);
