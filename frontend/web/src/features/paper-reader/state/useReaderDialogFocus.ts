import { useEffect, type RefObject } from "react";
export function useReaderDialogFocus(
  root: RefObject<HTMLDivElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    const dialog = root.current?.matches('[aria-modal="true"]')
      ? root.current
      : root.current?.querySelector<HTMLElement>('[aria-modal="true"]');
    const controls = () => [...(dialog?.querySelectorAll<HTMLElement>("button,input") ?? [])];
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      if (event.key === "Tab") {
        const nodes = controls(),
          index = nodes.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        nodes[(index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length]?.focus();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      if (previous?.isConnected) {
        previous.focus();
      }
    };
  }, [open]);
}
