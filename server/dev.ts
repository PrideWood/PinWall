import { createServer } from "node:http";
import { createServer as createViteServer, loadEnv } from "vite";
Object.assign(process.env, loadEnv("development", process.cwd(), ""));
const { nodeHandler } = await import("./node.js");
const api = createServer(nodeHandler);
api.listen(3001, "127.0.0.1");
const vite = await createViteServer({
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
await vite.listen();
vite.printUrls();
async function close() {
  await vite.close();
  api.close();
  process.exit();
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
