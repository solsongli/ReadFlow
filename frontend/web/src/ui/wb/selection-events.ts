/** Coalesce keyboard selection and wait for a pointer gesture to finish before reading geometry. */
export function settledSelection(root: () => HTMLElement | null, work: () => void) {
  let dragging = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    if (!dragging) timer = setTimeout(work, 80);
  };
  const down = (event: PointerEvent) => {
    if (event.button === 0 && root()?.contains(event.target as Node)) {
      dragging = true;
      clearTimeout(timer);
    }
  };
  const up = () => {
    dragging = false;
    schedule();
  };
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
  document.addEventListener("selectionchange", schedule);
  window.addEventListener("blur", up);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    document.removeEventListener("selectionchange", schedule);
    window.removeEventListener("blur", up);
  };
}
