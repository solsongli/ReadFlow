import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";

/** Click-to-edit text. Enter saves, Escape cancels, blur saves when changed. */
export function InlineEdit({ value, placeholder, label, onSave, className, inputClassName, validate }: {
  value: string;
  placeholder: string;
  label: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
  validate?: (value: string) => string | null;
}) {
  const cancelled = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    if (cancelled.current) return;
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
    cancelled.current = true;
    setEditing(false);
    setError(null);
    onSave(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") commit();
    if (event.key === "Escape") {
      cancelled.current = true;
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
            "h-8 w-full min-w-0 rounded-lg border-0 bg-wb-fill px-2 outline-none",
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
      onClick={() => { cancelled.current = false; setEditing(true); }}
      className={cn(
        "group/edit min-w-0 rounded border-0 bg-transparent px-0 text-left hover:bg-wb-hover",
        className,
        !value && "text-wb-text-3",
      )}
    >
      {value || <span className="inline-flex items-center gap-1.5">{placeholder}<Pencil size={12} aria-hidden="true" className="wb-transition opacity-0 group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100" /></span>}
    </button>
  );
}
