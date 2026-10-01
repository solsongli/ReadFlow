import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex='0']") || []).filter((el) => !(el as HTMLButtonElement).disabled);
    focusable()[0]?.focus();
    function handle(event: KeyboardEvent) {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const nodes = focusable();
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    }
    document.addEventListener("keydown", handle);
    return () => { document.removeEventListener("keydown", handle); previous?.focus(); };
  }, []);
  return <div className="dialog-backdrop"><div className={`dialog ${wide ? "dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
    <div className="dialog-heading"><h2>{title}</h2><button className="icon-button" aria-label="关闭对话框" onClick={onClose}>×</button></div>{children}
  </div></div>;
}
