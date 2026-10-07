import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ui/wb/Button.js";
import { settledSelection } from "@/ui/wb/selection-events.js";
export function SelectionTools({
  root,
  copy,
  tools,
  annotationTools,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  tools?: ReactNode;
  annotationTools?: ReactNode;
  copy: (format: "plain" | "author" | "gbt") => void;
}) {
  const toolbar = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState(false);
  const [box, setBox] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const selection = () => {
      const value = window.getSelection();
      if (!value?.toString().trim() || !value.anchorNode || !root.current?.contains(value.anchorNode)) {
        setBox(null);
        return;
      }
      const anchor = value.anchorNode instanceof Element ? value.anchorNode : value.anchorNode.parentElement;
      if (!anchor?.closest(".pr-text-layer")) {
        setBox(null);
        return;
      }
      setSource(Boolean(anchor.closest('[data-annotation-source="true"]')));
      const range = value.getRangeAt(0),
        rect = range.getBoundingClientRect();
      setBox({ x: Math.max(12, Math.min(rect.left, innerWidth - 380)), y: Math.max(8, rect.top - 44) });
    };
    const cleanup = settledSelection(() => root.current, selection);
    const cleared = () => setBox(null);
    document.addEventListener("readflow:selection-cleared", cleared);
    return () => {
      cleanup();
      document.removeEventListener("readflow:selection-cleared", cleared);
    };
  }, [root]);
  useLayoutEffect(() => {
    if (!box || !toolbar.current) return;
    const width = toolbar.current.getBoundingClientRect().width;
    const x = Math.max(8, Math.min(box.x, innerWidth - width - 12));
    if (Math.abs(x - box.x) > 1) setBox({ ...box, x });
  }, [box, tools, annotationTools]);
  if (!box) {
    return null;
  }
  return (
    <div
      ref={toolbar}
      role="toolbar"
      aria-label="选中文字工具条"
      className="fixed z-40 flex max-w-[95vw] flex-wrap gap-1 rounded-xl border border-wb-line-soft bg-wb-panel p-1.5 shadow-wb-pop"
      style={{ left: box.x, top: box.y }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {source ? annotationTools : null}
      <Button size="sm" onClick={() => copy("plain")}>
        复制
      </Button>
      <Button size="sm" onClick={() => copy("author")}>
        复制为引用
      </Button>
      <Button size="sm" onClick={() => copy("gbt")}>
        GB/T + 页码
      </Button>
      {tools}
    </div>
  );
}
