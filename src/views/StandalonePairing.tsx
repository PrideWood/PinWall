import { useId, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { pairingTokenFromLink } from "../lib/devicePairing";

export function StandalonePairing({ onPaired }: { onPaired: () => void }) {
  const id = useId();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function bind(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    try {
      const token = pairingTokenFromLink(link, location.origin);
      setLink("");
      setBusy(true);
      await api("/phone/pair", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      onPaired();
    } catch (error) {
      setError(error instanceof Error ? error.message : "绑定失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="standalone-pairing" onSubmit={(event) => void bind(event)}>
      <p>
        主屏幕应用可能不共享浏览器的绑定状态。请粘贴你在可信电脑生成的首次绑定链接，在此应用内完成绑定。
      </p>
      <label htmlFor={id}>一次性绑定链接</label>
      <input
        id={id}
        type="password"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={link}
        onChange={(event) => setLink(event.target.value)}
        placeholder="粘贴首次绑定链接"
        disabled={busy}
        required
        aria-describedby={`${id}-help`}
      />
      <p id={`${id}-help`} className="fineprint">
        链接仅 10
        分钟有效、只能使用一次。请生成新链接，已在浏览器中完成绑定的旧链接不能重复使用。
      </p>
      <button className="primary" type="submit" disabled={busy || !link.trim()}>
        {busy ? "正在绑定…" : "绑定此主屏幕应用"}
      </button>
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
