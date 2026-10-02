import { useEffect } from "react";
import { LIBRARY_TAB } from "../../domain/workbench-store.js";
import { useWorkbench } from "../context.js";

const INTERACTIVE = '[role="menu"],[role="dialog"],[role="listbox"]:not([data-wb-list]),[data-radix-popper-content-wrapper]';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || Boolean(target.closest(INTERACTIVE));
}

/** Library keyboard model: J/K or ↑/↓ move, Enter reads, S stars, G adds to groups, Del trashes. */
export function useWorkbenchKeys() {
  const wb = useWorkbench();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      const state = wb.store.getSnapshot();
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key === "/") { event.preventDefault(); wb.setShortcuts(!state.shortcutsOpen); return; }
      if (state.shortcutsOpen) { if (event.key === "Escape") { event.preventDefault(); wb.setShortcuts(false); } return; }
      if (modifier && event.key.toLowerCase() === "n") { event.preventDefault(); void wb.notes.create(); return; }
      if (modifier && event.key === ",") { event.preventDefault(); wb.openSettings(); return; }
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        wb.setPalette(!state.paletteOpen);
        return;
      }
      if (modifier && (event.key === "1" || event.key === "2")) {
        event.preventDefault();
        if (event.key === "1") wb.setMain("desk");
        else wb.browse({ view: state.view, groupId: state.groupId, tag: state.tag });
        return;
      }
      if (state.paletteOpen || modifier || event.altKey || isTyping(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        const search = document.querySelector<HTMLInputElement>(state.main === "notes" ? "[data-notes-search]" : "[data-wb-search]");
        if (state.activeTab === LIBRARY_TAB && search) search.focus();
        else wb.setPalette(true);
        return;
      }
      if (state.activeTab !== LIBRARY_TAB || state.main !== "library") return;
      const selected = state.selectedIds;
      const focus = selected[selected.length - 1];
      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          wb.moveSelection(1, event.shiftKey);
          break;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          wb.moveSelection(-1, event.shiftKey);
          break;
        case "Enter":
          if (event.target instanceof HTMLElement && event.target.closest("button,a")) return;
          event.preventDefault();
          if (focus && state.view !== "trash") void wb.openReader(focus);
          break;
        case "s":
        case "S":
          event.preventDefault();
          if (selected.length) void wb.toggleStar(selected);
          break;
        case "g":
        case "G":
          event.preventDefault();
          if (selected.length && state.view !== "trash") wb.store.actions.patch({ pickerOpen: true });
          break;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          if (selected.length && state.view !== "trash") void wb.trash(selected);
          break;
        default:
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wb]);
}
