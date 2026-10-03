import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/ui/wb/Button.js";
import { SHORTCUTS } from "../../domain/shortcuts.js";
import { useWb, useWorkbench } from "../context.js";

export function ShortcutsPanel() {
  const wb = useWorkbench();
  const open = useWb((state) => state.shortcutsOpen);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus(); return () => previous?.focus();
  }, [open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-wb-overlay p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) wb.setShortcuts(false); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label="键盘快捷键" tabIndex={-1} className="wb-scroll max-h-[85vh] w-[600px] max-w-full rounded-xl bg-wb-panel p-5 text-wb-text shadow-wb-pop" onKeyDown={(e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); wb.setShortcuts(false); }
      if (e.key === "Tab") { e.preventDefault(); panel.current?.querySelector<HTMLButtonElement>("button")?.focus(); }
    }}>
      <div className="mb-4 flex items-center justify-between"><h2 className="m-0 text-[1.1875rem] font-semibold">键盘快捷键</h2><IconButton label="关闭快捷键面板" onClick={() => wb.setShortcuts(false)}><X size={16} aria-hidden="true" /></IconButton></div>
      <div className="grid gap-5 sm:grid-cols-2">{["通用", "文献库", "阅读", "笔记"].map((group) => <section key={group} aria-label={`${group}快捷键`}><h3 className="mb-2 mt-0 text-[0.75rem] font-semibold text-wb-text-3">{group}</h3><dl className="m-0 flex flex-col gap-2.5">{SHORTCUTS.filter((entry) => entry.group === group).map((entry) => <div key={entry.id} className="flex items-start justify-between gap-3 text-[0.75rem]"><dt>{entry.label}</dt><dd className="m-0 shrink-0 rounded-md bg-wb-fill px-1.5 py-0.5 text-[0.6875rem] text-wb-text-2">{entry.keys}</dd></div>)}</dl></section>)}</div>
    </div>
  </div>;
}
