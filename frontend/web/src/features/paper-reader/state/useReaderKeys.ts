import { useEffect, useRef } from "react";
import type { Zoom } from "../ui/PdfPane.js";
export function useReaderKeys(options: {
  active: boolean;
  annotationKeys?: (event: KeyboardEvent) => boolean;
  pages: number;
  jump: (page: number) => void;
  scroll: (amount: number) => void;
  height: () => number;
  back: () => void;
  forward: () => void;
  search: () => void;
  result: (direction: number) => void;
  section: (direction: number) => void;
  focus: () => void;
  copy: () => void;
  scale: () => number;
  setZoom: (zoom: Zoom) => void;
}) {
  const buffer = useRef({ digits: "", lastG: 0, digitTime: 0 });
  useEffect(() => {
    const state = buffer.current;
    if (!options.active) {
      state.digits = "";
      state.lastG = 0;
    }
    const key = (event: KeyboardEvent) => {
      if (!options.active || event.defaultPrevented || event.isComposing) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest?.("[data-thought-canvas]")) {
        return;
      }
      if (
        target instanceof Element &&
        target.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"],[data-radix-popper-content-wrapper]',
        )
      ) {
        return;
      }
      const modified = event.ctrlKey || event.metaKey;
      let handled = true;
      if (options.annotationKeys?.(event)) {
        handled = true;
      } else if (modified && event.key.toLowerCase() === "f") {
        options.search();
      } else if (modified && event.shiftKey && event.key.toLowerCase() === "c") {
        options.copy();
      } else if (modified && ["=", "+", "-", "0"].includes(event.key)) {
        options.setZoom(
          event.key === "0"
            ? "width"
            : Math.max(0.2, Math.min(4, options.scale() * (event.key === "-" ? 1 / 1.15 : 1.15))),
        );
      } else if (event.altKey && event.key === "ArrowLeft") {
        options.back();
      } else if (event.altKey && event.key === "ArrowRight") {
        options.forward();
      } else if (modified || event.altKey) {
        handled = false;
      } else if (/^[0-9]$/.test(event.key)) {
        if (Date.now() - state.digitTime > 2500) {
          state.digits = "";
        }
        state.digits = (state.digits + event.key).slice(-5);
        state.digitTime = Date.now();
      } else if (event.key === "Enter" && state.digits) {
        const page = +state.digits;
        state.digits = "";
        if (page >= 1 && page <= options.pages) {
          options.jump(page);
        }
      } else if (event.key === "g") {
        if (Date.now() - state.lastG < 700) {
          options.jump(1);
        }
        state.lastG = Date.now();
      } else if (event.key === "G" || event.key === "End") {
        options.jump(options.pages);
      } else if (event.key === "Home") {
        options.jump(1);
      } else if (["j", "k", "ArrowDown", "ArrowUp", " ", "PageDown", "PageUp"].includes(event.key)) {
        options.scroll(
          (event.key === "k" ||
          event.key === "ArrowUp" ||
          event.key === "PageUp" ||
          (event.key === " " && event.shiftKey)
            ? -1
            : 1) * (["j", "k", "ArrowDown", "ArrowUp"].includes(event.key) ? 100 : options.height() * 0.85),
        );
      } else if (event.key.toLowerCase() === "f") {
        options.focus();
      } else if (event.key === "n" || event.key === "N") {
        options.result(event.key === "n" ? 1 : -1);
      } else if (event.key === "[" || event.key === "]") {
        options.section(event.key === "[" ? -1 : 1);
      } else {
        handled = false;
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [options]);
}
