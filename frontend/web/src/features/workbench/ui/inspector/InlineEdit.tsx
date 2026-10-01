import { useEffect, useState, type KeyboardEvent } from "react";
import { cn } from "@/ui/lib/utils.js";

/** Click-to-edit text. Enter saves, Escape cancels, blur saves when changed. */
export function InlineEdit({ value, placeholder, label, onSave, className, inputClassName, mono, validate }: {
  value: string;
  placeholder: string;
  label: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
  mono?: boolean;
  validate?: (value: string) => string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    const next = draft.trim();
    if (next === value) {
      setEditing(false);
      return;
    }
    const problem = validate?.(next) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    setEditing(false);
    setError(null);
    onSave(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") {
      setDraft(value);
      setError(null);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <span className="flex min-w-0 flex-col gap-0.5">
        <input
          autoFocus
          aria-label={label}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          className={cn(
            "h-6 w-full min-w-0 rounded border border-wb-accent-line bg-wb-panel px-1.5 outline-none",
            mono && "font-wb-mono text-[12px]",
            inputClassName,
          )}
        />
        {error ? <span className="text-[11.5px] text-wb-danger">{error}</span> : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={`编辑${label}`}
      onClick={() => setEditing(true)}
      className={cn(
        "min-w-0 rounded border-0 bg-transparent px-0 text-left hover:bg-wb-hover",
        !value && "text-wb-text-4",
        mono && "font-wb-mono text-[12px]",
        className,
      )}
    >
      {value || placeholder}
    </button>
  );
}
