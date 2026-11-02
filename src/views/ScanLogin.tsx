import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Smartphone, RefreshCw, X } from "lucide-react";
import { api } from "../lib/api";
import { isStandalone } from "../lib/devicePairing";
import { StandalonePairing } from "./StandalonePairing";
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
  const [trusted, setTrusted] = useState(false);
  const [standalone] = useState(() => isStandalone());
  const [useQr, setUseQr] = useState(false);
  const success = useRef(onSuccess);
  const close = useRef(onClose);
  useEffect(() => {
    success.current = onSuccess;
    close.current = onClose;
  }, [onSuccess, onClose]);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function start() {
      try {
        const device = await api<{ trusted: boolean }>("/phone/status");
        if (!active) return;
        if (device.trusted) {
          setTrusted(true);
          setState("ready");
          return;
        }
        if (standalone && !useQr) {
          setState("unbound");
          return;
        }
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
  }, [generation, standalone, useQr]);
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
  async function editHere() {
    setState("claiming");
    setError("");
    try {
      await api("/auth/owner/trusted-edit", { method: "POST", body: "{}" });
      await onSuccess();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "授权失败，请重试。");
      setState("failed");
    }
  }
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
        aria-label="关闭授权面板"
        onClick={onClose}
        disabled={state === "claiming"}
      >
        <X size={18} />
      </button>
      <Smartphone size={27} />
      <h2 id="scan-title">
        {trusted
          ? "此设备已受信任"
          : standalone && !useQr
            ? "绑定主屏幕应用"
            : "用手机解锁编辑"}
      </h2>
      <p>
        {trusted
          ? "直接在此设备编辑，无需扫码。授权保留至手机绑定到期，最长 180 天。"
          : standalone && !useQr
            ? "绑定后可直接编辑，授权最长保留 180 天。"
            : "用已绑定的手机扫码，核对授权码后确认。"}
      </p>
      {state === "loading" ? (
        <div className="qr-loading">正在确认设备…</div>
      ) : trusted ? (
        <button
          className="primary"
          disabled={state === "claiming"}
          onClick={() => void editHere()}
        >
          {state === "claiming" ? "正在进入…" : "在此设备编辑"}
        </button>
      ) : standalone && !useQr ? (
        <StandalonePairing
          onPaired={() => {
            setTrusted(true);
            setState("ready");
            setError("");
          }}
        />
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
      {state !== "claiming" && !trusted && (!standalone || useQr) && (
        <button
          className="quiet"
          onClick={() => {
            setState("loading");
            setError("");
            setTicket(null);
            setTrusted(false);
            setGeneration((v) => v + 1);
          }}
        >
          <RefreshCw size={15} />
          刷新二维码
        </button>
      )}
      {standalone &&
        !trusted &&
        state !== "loading" &&
        state !== "claiming" && (
          <button
            className="quiet"
            onClick={() => {
              setUseQr((current) => !current);
              setState("loading");
              setError("");
              setTicket(null);
            }}
          >
            {useQr ? "返回绑定主屏幕应用" : "用其他手机扫码授权"}
          </button>
        )}
      <p className="fineprint">
        {trusted
          ? "退出编辑后可再次点击进入；解除绑定会撤销此设备的长期授权。"
          : "无需密码或蓝牙。首次使用请先绑定当前浏览器。"}
      </p>
    </dialog>
  );
}
