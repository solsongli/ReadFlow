import { useEffect } from "react";
import { LIBRARY_TAB } from "../../domain/workbench-store.js";
import { useWorkbench } from "../context.js";

const INTERACTIVE = '[role="menu"],[role="dialog"],[role="listbox"],[data-radix-popper-content-wrapper]';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || Boolean(target.closest(INTERACTIVE));
}

/** Library keyboard model: J/K or ↑/↓ move, Enter reads, S stars, G adds to groups, Del trashes. */
export function useWorkbenchKeys() {
  const wb = useWorkbench();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const state = wb.store.getSnapshot();
      const modifier = event.ctrlKey || event.metaKey;
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
        wb.setPalette(true);
        return;
      }
      if (state.activeTab !== LIBRARY_TAB || state.main !== "library") return;
      const selected = state.selectedIds;
      const focus = selected[selected.length - 1];
      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          wb.moveSelection(1);
          break;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          wb.moveSelection(-1);
          break;
        case "Enter":
          if (focus && state.view !== "trash") void wb.openReader(focus);
          break;
        case "s":
        case "S":
          if (selected.length) void wb.toggleStar(selected);
          break;
        case "g":
        case "G":
          if (selected.length) wb.store.actions.patch({ pickerOpen: true });
          break;
        case "Delete":
        case "Backspace":
          if (selected.length && state.view !== "trash") void wb.trash(selected);
          break;
        default:
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wb]);
}
