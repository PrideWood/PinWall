import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Smartphone, RefreshCw, X } from "lucide-react";
import { api } from "../lib/api";
type Ticket = {
  id: string;
  secret: string;
  code: string;
  expiresAt: string;
  url: string;
};
export function ScanLogin({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [state, setState] = useState("loading");
  const [generation, setGeneration] = useState(0);
  const [seconds, setSeconds] = useState(180);
  const success = useRef(onSuccess);
  success.current = onSuccess;
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState("loading");
    setError("");
    setTicket(null);
    async function start() {
      try {
        const value = await api<Ticket>("/edit-requests", { method: "POST" });
        const image = await QRCode.toDataURL(value.url, {
          width: 248,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        if (!active) return;
        setTicket(value);
        setQr(image);
        setState("pending");
        async function poll() {
          if (!active) return;
          try {
            const result = await api<{ state: string }>(
              "/edit-requests/status",
              {
                method: "POST",
                body: JSON.stringify({ id: value.id, secret: value.secret }),
              },
            );
            if (!active) return;
            if (result.state === "approved") {
              setState("claiming");
              await api("/auth/owner/claim-edit", {
                method: "POST",
                body: JSON.stringify({ id: value.id, secret: value.secret }),
              });
              if (!active) return;
              await success.current();
              close.current();
              return;
            }
            if (result.state !== "pending") {
              setState(result.state);
              return;
            }
            timer = setTimeout(() => void poll(), 2000);
          } catch (error) {
            if (active) {
              setError(
                error instanceof Error
                  ? error.message
                  : "连接失败，请刷新二维码。",
              );
              setState("failed");
            }
          }
        }
        timer = setTimeout(() => void poll(), 2000);
      } catch (error) {
        if (active) {
          setError(error instanceof Error ? error.message : "无法生成二维码。");
          setState("failed");
        }
      }
    }
    void start();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [generation]);
  useEffect(() => {
    if (!ticket) return;
    const update = () => {
      const left = Math.max(
        0,
        Math.ceil((Date.parse(ticket.expiresAt) - Date.now()) / 1000),
      );
      setSeconds(left);
      if (!left)
        setState((current) => (current === "pending" ? "expired" : current));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [ticket]);
  return (
    <dialog
      ref={dialog}
      className="scan-dialog"
      aria-labelledby="scan-title"
      onCancel={(event) => {
        event.preventDefault();
        if (state !== "claiming") onClose();
      }}
    >
      <button
        className="icon-button close-login"
        aria-label="关闭扫码授权"
        onClick={onClose}
        disabled={state === "claiming"}
      >
        <X size={18} />
      </button>
      <Smartphone size={27} />
      <h2 id="scan-title">用手机解锁编辑</h2>
      <p>用已绑定的手机扫码，核对授权码后确认。</p>
      {state === "loading" ? (
        <div className="qr-loading">正在生成二维码…</div>
      ) : (
        ticket && (
          <>
            <img
              className={`login-qr ${state !== "pending" ? "qr-inactive" : ""}`}
              src={qr}
              data-scan-url={ticket.url}
              alt="编辑授权二维码"
            />
            <div className="check-code">{ticket.code}</div>
            <p className="qr-status" role="status">
              {state === "pending"
                ? `等待手机确认 · ${seconds} 秒后失效`
                : state === "claiming"
                  ? "已批准，正在进入编辑模式…"
                  : state === "denied"
                    ? "手机已拒绝此请求"
                    : state === "expired"
                      ? "二维码已过期"
                      : "请刷新二维码重试"}
            </p>
          </>
        )
      )}
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      {state !== "claiming" && (
        <button className="quiet" onClick={() => setGeneration((v) => v + 1)}>
          <RefreshCw size={15} />
          刷新二维码
        </button>
      )}
      <p className="fineprint">无需密码或蓝牙。首次使用请先绑定手机。</p>
    </dialog>
  );
}
