import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";

export function RenameBoardDialog({
  title,
  onClose,
  onSave,
}: {
  title: string;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    input.current?.focus();
    input.current?.select();
    return () => {
      modal?.close();
    };
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    if (name.trim() === title) {
      onClose();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(name.trim());
    } catch (error) {
      setError(error instanceof Error ? error.message : "重命名失败，请重试。");
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="rename-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <button
        type="button"
        className="icon-button rename-close"
        aria-label="关闭重命名"
        onClick={onClose}
        disabled={saving}
      >
        <X size={18} />
      </button>
      <form onSubmit={(event) => void save(event)}>
        <h2 id={`${id}-title`}>重命名白板</h2>
        <label htmlFor={`${id}-name`}>白板名称</label>
        <input
          ref={input}
          id={`${id}-name`}
          value={name}
          maxLength={120}
          required
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          disabled={saving}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error && (
          <p id={`${id}-error`} className="rename-error" role="alert">
            {error}
          </p>
        )}
        <div className="rename-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button
            type="submit"
            className="primary"
            disabled={saving || !name.trim()}
          >
            {saving ? "正在保存…" : "保存名称"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
