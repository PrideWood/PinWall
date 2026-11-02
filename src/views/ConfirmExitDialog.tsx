import { useEffect, useId, useRef } from "react";
import { LogOut } from "lucide-react";
import "./ConfirmExitDialog.css";

export function ConfirmExitDialog({
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    cancel.current?.focus();
    return () => {
      modal?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-exit-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <LogOut size={24} className="confirm-exit-icon" />
      <h2 id={`${id}-title`}>退出编辑？</h2>
      <p id={`${id}-description`}>
        退出前会先保存当前白板，之后此浏览器将回到只读模式。
      </p>
      {error && (
        <p className="confirm-exit-error" role="alert">
          {error}
        </p>
      )}
      <div className="confirm-exit-actions">
        <button ref={cancel} type="button" onClick={onCancel} disabled={busy}>
          继续编辑
        </button>
        <button
          type="button"
          className="primary"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "正在保存并退出…" : "确认退出"}
        </button>
      </div>
    </dialog>
  );
}
