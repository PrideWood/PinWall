# 个人白板

只保留 Excalidraw 画布。访客可以查看你已保存的白板，只有你通过手机扫码授权后才能编辑。没有邮箱或密码输入，也不需要手机 App 或电脑蓝牙。

生产域名：`https://pw.dacnote.com`（沿用原 PinWall 项目）。

## 使用方式

1. 在电脑打开网站，默认进入最近保存白板的只读视图。
2. 点击右上角手机图标，电脑显示一次性二维码和六位核对码。
3. 用已绑定的手机扫码，在手机核对设备信息与六位码，勾选确认后点“允许编辑”。
4. 电脑自动进入编辑模式，原生绘图工具栏出现，内容自动保存到云端。
5. 在教室等公共电脑使用完毕，点击手机图标或原生菜单中的“退出编辑”。

手机授权面板仅在点击后显示，不占用常驻画布空间。白板列表、导入导出、刷新和退出收在 Excalidraw 原生菜单中。

## 首次绑定手机

在可信电脑的项目目录配置好 `.env.local`，运行：

```sh
npm install
npm run db:migrate
APP_URL=https://pw.dacnote.com npm run phone:pair
```

用自己的手机扫描终端生成的一次性二维码，在手机点“绑定这部手机”。此二维码仅 10 分钟有效，只能使用一次；它能授予手机授权身份，不要分享或提交到 Git。

若尚无 Owner 账号，脚本会建立单一账号并使用不可见的随机密码作为内部数据，网页不提供密码登录或公开注册。`OWNER_EMAIL` 只是服务器内的账号标识，不需要在网页输入邮箱。

手机身份保留最长 180 天，使用同一手机浏览器即可继续授权。建议用系统相机扫码后在 Safari / Chrome 等固定浏览器打开；无痕模式、清除网站数据或更换浏览器后需要重新绑定。

手机丢失或需要撤销所有设备时，在可信电脑运行：

```sh
npm run phone:revoke
```

这会撤销所有已绑定手机、待处理请求和已登录编辑会话。然后重新生成绑定二维码。

## 授权规则

- 手机绑定凭据只保存在 HttpOnly、SameSite Cookie 中；生产环境设置 Secure，数据库只存令牌哈希。
- 手机本身的长期身份与电脑的 Better Auth 编辑会话分开保存。
- 编辑请求 3 分钟有效，绑定发起浏览器的 HttpOnly Cookie 与独立秘密；手机必须显式确认核对码。
- 一次批准只能领取一次，拒绝、过期、重复领取和换浏览器领取都会失败。
- 电脑编辑会话最长 12 小时，在共享电脑上应主动退出。
- 手机不会自动批准请求，不显示网络地址或精确位置，显示的是浏览器报告的设备类型。
- 线上绑定和授权必须通过 HTTPS；`localhost` 仅供本机开发，不能直接供手机扫码访问。

## 架构

- React + TypeScript + Vite，`@excalidraw/excalidraw` npm 包，不 fork Excalidraw。
- Neon Postgres 保存单一账号、Better Auth 会话、白板场景、版本及图片元数据。
- Neon Object Storage 的 `whiteboard-images` 私有桶保存图片，使用标准 S3 接口，可更换为 R2 等兼容服务。
- 同一仓库的 Vercel Node API 验证编辑权限。前端没有数据库、对象存储或认证密钥。
- 访客可列出、读取 Owner 的白板，以及当前保存场景引用的图片；所有写入操作均需真实 Owner 会话。未发布或已移除图片不能通过访客图片接口读取。

## 本地开发

需要 Node.js 22.12+。复制 `.env.example` 为 `.env.local`，填入服务器配置：

| 变量                   | 内容                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`         | Neon pooled 连接串，使用 `sslmode=verify-full`              |
| `APP_URL`              | 本地 `http://localhost:5173`；生产 `https://pw.dacnote.com` |
| `BETTER_AUTH_SECRET`   | 至少 32 字符随机密钥，保持稳定                              |
| `OWNER_EMAIL`          | 唯一 Owner 的内部邮箱标识                                   |
| `S3_ENDPOINT`          | Neon Connect → Storage 的 `AWS_ENDPOINT_URL_S3`             |
| `S3_REGION`            | 当前 Neon 为 `ap-southeast-1`                               |
| `S3_BUCKET`            | `whiteboard-images`                                         |
| `S3_ACCESS_KEY_ID`     | 对象存储访问凭据 ID                                         |
| `S3_SECRET_ACCESS_KEY` | 对象存储私钥                                                |

不要将秘密放进 `VITE_*` 变量、聊天或 Git。`.env.local`、`.legacy` 均被 Git 和 Vercel 上传忽略。

```sh
npm run db:migrate
npm run dev
```

前端为 `http://localhost:5173`，API 在本机 3001 端口，通过同源 `/api` 代理访问。本地配置与生产服务器变量独立。

## 保存与恢复

- 约一秒防抖自动保存，串行写入并保持准确的保存状态。手机图标的小圆点表示保存状态，悬停可查看说明。
- 失败时保留本机 IndexedDB 草稿，恢复联网后重试；页面重开时可恢复草稿或导出备份。
- 乐观版本检查防止旧电脑覆盖另一设备的新版本。冲突时先导出本地副本，再加载云端。
- 图片与场景分开持久化，跨设备恢复实际图片字节。支持 PNG / JPEG / GIF / WebP，单张最大 3 MB。
- `.excalidraw` 导出包含图片，可独立备份和恢复。
- 退出编辑清除本机草稿与私有画布内存，其他同源标签页也会收到退出通知，然后回到公共只读画布。
- 删除白板时清理全部关联图片。删除单张图片时暂留对象以供撤销，访客无法访问这些未引用对象。

```sh
npm run storage:check
npm run storage:cleanup
```

前者上传、读回核对并删除一张微小测试图；后者重试待处理图片删除，每次最多 100 条。

## 部署

Vercel 项目为 `wesleys-projects-1271cfd1/pin-wall`，保留 `pw.dacnote.com`。生产配置使用 HTTPS `APP_URL`；`vercel.json` 包含 Vite 构建和 Node API 路由。

数据库迁移在可信电脑单独运行，不在构建时自动执行。生产变量必须设置在 Vercel 服务器环境中。不要向无保护的日志或预览部署输出绑定链接。

## 验证

```sh
npm run check
npm test
npm run build
npm run test:integration
```

集成测试需要本机 PostgreSQL 工具，创建一次性数据库和 S3 协议测试服务，验证手机绑定、防重放、浏览器绑定、批准、拒绝、过期、撤销、真实 Better Auth 会话、访客只读、图片恢复和同时保存冲突；结束后清理测试数据库。

本地模拟浏览器或集成测试不等同于已经在实体手机上扫码完成验证。实体手机首次绑定与授权须由你自己确认。

依赖已处理高危项；生产审计剩余 Excalidraw → Mermaid → KaTeX 链路的 4 个 low 条目，开发工具另有 moderate 条目。升级时复核 `package.json` 的兼容性覆盖。

## 旧版保留

重构前文件（含未提交的 `src/App.css` 修改）位于 `.legacy/pinwall-before-rebuild.tar.gz`，差异位于 `.legacy/working-tree.patch`。这些仅在本机保留，不上传部署。回退时先在独立目录解压检查。

## 网站与主屏幕图标

`public/icons/whiteboard-master.png` 为已去黑边的原图母版（不透明白底）。favicon、180 / 167 / 152 像素 Apple Touch Icon、192 / 512 像素 PWA 图标及单独的 maskable 图标均从此导出；ICO 与兼容 SVG 可通过 `node scripts/package-favicon.mjs` 重新打包。

`index.html` 提供 Apple Touch Icon、独立模式和白色主题配置，manifest 设置稳定的 `id`、`start_url`、`scope` 和 `display: standalone`。iPhone 页面使用安全区域内边距，避开刘海、状态栏及主屏幕指示条。图标链接带版本参数。已添加到主屏幕的旧图标如果仍被系统缓存，需移除旧快捷方式后重新添加。
