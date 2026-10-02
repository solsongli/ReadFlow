import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/ui/lib/utils.js";

/** Reveal is local, explicit, and cleared on focus loss, app blur or unmount. */
export function SecretField({ label, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const hide = () => setVisible(false);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("blur", hide); document.removeEventListener("visibilitychange", hide); };
  }, []);
  return (
    <span className={cn("flex min-w-0 items-center gap-1 rounded-lg bg-wb-fill", className)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setVisible(false); }}>
      <input {...props} ref={input} aria-label={label} type={visible ? "text" : "password"} autoComplete="off" spellCheck={false} className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2.5 outline-none" />
      <button type="button" aria-label={`${visible ? "隐藏" : "显示"}${label}`} aria-pressed={visible} disabled={props.disabled}
        onClick={() => { setVisible(!visible); input.current?.focus(); }} className="wb-transition mr-1 h-6 shrink-0 rounded-md border-0 bg-transparent px-2 text-[12px] text-wb-text-2 hover:bg-wb-hover disabled:opacity-50">{visible ? "隐藏" : "显示"}</button>
    </span>
  );
}
