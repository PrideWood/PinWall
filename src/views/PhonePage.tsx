import { useEffect, useState } from "react";
import { Check, ShieldCheck, Smartphone } from "lucide-react";
import { api } from "../lib/api";
type Ticket = {
  code: string;
  device: string;
  state: string;
  expiresAt: string;
};
export function PhonePage() {
  const [context, setContext] = useState(
    () => new URLSearchParams(location.hash.slice(1)),
  );
  const pair = context.get("pair");
  const request = context.get("request");
  const [trusted, setTrusted] = useState(false);
  const [ready, setReady] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [matched, setMatched] = useState(false);
  useEffect(() => {
    const changed = () =>
      setContext(new URLSearchParams(location.hash.slice(1)));
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    setReady(false);
    setTicket(null);
    setResult("");
    setError("");
    setMatched(false);
    history.replaceState(null, "", "/phone");
    let active = true;
    async function load() {
      try {
        const status = await api<{ trusted: boolean }>("/phone/status");
        if (!active) return;
        setTrusted(status.trusted);
        if (request && status.trusted) {
          const value = await api<Ticket>("/phone/request", {
            method: "POST",
            body: JSON.stringify({ token: request }),
          });
          if (active) setTicket(value);
        }
      } catch (error) {
        if (active)
          setError(error instanceof Error ? error.message : "连接失败。");
      } finally {
        if (active) setReady(true);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [request, pair]);
  async function bind() {
    setBusy(true);
    setError("");
    try {
      await api("/phone/pair", {
        method: "POST",
        body: JSON.stringify({ token: pair }),
      });
      setTrusted(true);
      setResult("paired");
    } catch (error) {
      setError(error instanceof Error ? error.message : "绑定失败。");
    } finally {
      setBusy(false);
    }
  }
  async function approve(allow: boolean) {
    if (!ticket) return;
    setBusy(true);
    setError("");
    try {
      await api("/phone/approve", {
        method: "POST",
        body: JSON.stringify({ token: request, code: ticket.code, allow }),
      });
      setResult(allow ? "approved" : "denied");
    } catch (error) {
      setError(error instanceof Error ? error.message : "授权失败。");
    } finally {
      setBusy(false);
    }
  }
  async function editHere() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/owner/trusted-edit", { method: "POST", body: "{}" });
      location.assign("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "授权失败，请重试。");
      setBusy(false);
    }
  }
  return (
    <main className="phone-page">
      <section className="phone-card">
        <div className="brand-mark">
          <ShieldCheck size={27} />
        </div>
        <span className="eyebrow">WHITEBOARD · YOUR KEY</span>
        {!ready ? (
          <>
            <h1>正在确认手机身份…</h1>
          </>
        ) : result === "approved" ? (
          <>
            <div className="phone-success">
              <Check size={30} />
            </div>
            <h1>已允许编辑</h1>
            <p>
              请回到电脑，白板会自动解锁。
              <br />
              电脑离开时记得退出编辑。
            </p>
          </>
        ) : result === "denied" ? (
          <>
            <h1>已拒绝此次请求</h1>
            <p>电脑将保持访客只读模式。</p>
          </>
        ) : result === "paired" ? (
          <>
            <h1>这部手机已绑定</h1>
            <p>之后用这部手机的同一浏览器扫描电脑二维码，就能确认编辑权限。</p>
            <p className="fineprint">
              身份保留最长 180 天。清除浏览器数据或使用无痕模式后需要重新绑定。
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void editHere()}
            >
              {busy ? "正在进入…" : "在此设备编辑白板"}
            </button>
          </>
        ) : pair ? (
          <>
            <h1>绑定你的授权手机</h1>
            <p>绑定后，这部手机可以批准电脑的编辑请求。</p>
            <p className="notice">
              仅在这是你自己的手机、且绑定二维码由你在可信电脑生成时继续。
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void bind()}
            >
              <Smartphone size={17} />
              {busy ? "正在绑定…" : "绑定这部手机"}
            </button>
          </>
        ) : ticket ? (
          <>
            <h1>允许这台电脑编辑？</h1>
            <p>{ticket.device}</p>
            <div className="check-code">{ticket.code}</div>
            <p>请核对你面前电脑上显示的六位授权码。</p>
            <label className="match-code">
              <input
                type="checkbox"
                checked={matched}
                onChange={(e) => setMatched(e.target.checked)}
              />
              我正在使用这台电脑，授权码一致
            </label>
            <div className="phone-actions">
              <button
                onClick={() => void approve(false)}
                disabled={busy || ticket.state !== "pending"}
              >
                拒绝
              </button>
              <button
                className="primary"
                onClick={() => void approve(true)}
                disabled={!matched || busy || ticket.state !== "pending"}
              >
                {busy ? "正在授权…" : "允许编辑"}
              </button>
            </div>
            {ticket.state !== "pending" && (
              <p>此请求已经处理，请在电脑重新生成二维码。</p>
            )}
            <p className="fineprint">
              仅确认你主动发起的请求。编辑权限在退出后结束，最长保留 12 小时。
            </p>
          </>
        ) : (
          <>
            <h1>{trusted ? "你的白板钥匙已就绪" : "此手机尚未绑定"}</h1>
            <p>
              {trusted
                ? "用这部手机扫描电脑上的编辑二维码，就可以授权。"
                : "请先在可信电脑运行 npm run phone:pair，扫描一次性绑定二维码。"}
            </p>
            {trusted && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void editHere()}
              >
                {busy ? "正在进入…" : "在此设备编辑白板"}
              </button>
            )}
            {trusted && (
              <button
                className="quiet"
                disabled={busy}
                onClick={async () => {
                  if (!confirm("解除这部手机的授权身份？")) return;
                  setBusy(true);
                  try {
                    await api("/phone/revoke", { method: "POST" });
                    setTrusted(false);
                  } catch (error) {
                    setError(
                      error instanceof Error ? error.message : "解绑失败。",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                解除这部手机的绑定
              </button>
            )}
          </>
        )}
        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}
