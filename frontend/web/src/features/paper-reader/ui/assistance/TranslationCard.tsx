import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import type { useSelectionTranslation } from "../../state/assistance/useTranslation.js";
import type { AssistancePorts } from "../../domain/assistance.js";
import type { SelectionAnchor } from "../../domain/annotations/types.js";
export function TranslationCard({
  translation: t,
  ports,
  root,
  save,
}: {
  translation: ReturnType<typeof useSelectionTranslation>;
  ports: AssistancePorts;
  root: React.RefObject<HTMLDivElement | null>;
  save: (text: string, anchors: SelectionAnchor[]) => Promise<boolean>;
}) {
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [notice, setNotice] = useState("");
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!t.card) {
      return;
    }
    const anchor = t.card.selection[0];
    const page = root.current?.querySelector<HTMLElement>(
      `[data-annotation-source=true] [data-paper-page="${anchor.page + 1}"]`,
    );
    if (!page) {
      return;
    }
    const bounds = page.getBoundingClientRect();
    const pane = page.closest("[data-pdf-pane]")!;
    const viewport = pane.getBoundingClientRect();
    const rect = anchor.rects[0];
    const height = Math.min(card.current?.scrollHeight || 220, viewport.height - 16);
    setPosition({
      left: Math.max(viewport.left + 8, Math.min(bounds.left + rect.x * bounds.width, viewport.right - 348)),
      top: Math.max(
        viewport.top + 8,
        Math.min(bounds.top + (rect.y + rect.height) * bounds.height + 8, viewport.bottom - height - 8),
      ),
    });
    const close = () => t.close();
    pane.addEventListener("scroll", close);
    return () => pane.removeEventListener("scroll", close);
  }, [t.card]);
  if (!t.card) {
    return null;
  }
  return (
    <div
      ref={card}
      role="region"
      aria-label="选段译文"
      style={position}
      className="fixed z-40 max-h-[60vh] w-[340px] max-w-[90vw] overflow-auto rounded-xl bg-wb-panel p-4 shadow-wb-pop"
    >
      <div className="flex items-center justify-between">
        <strong className="text-[0.8125rem]">译文 · {t.card.service || "翻译服务"}</strong>
        <Button size="sm" onClick={t.close}>
          关闭
        </Button>
      </div>
      {t.busy ? (
        <p role="status" className="text-[0.8125rem] text-wb-text-3">
          正在翻译…
        </p>
      ) : null}
      {t.error ? (
        <p role="status" className="text-[0.8125rem] text-wb-text-3">
          {t.error.message}
          <Button size="sm" onClick={() => ports.settings("translation")}>
            去设置
          </Button>
          <Button size="sm" onClick={() => void t.translate(t.card!.selection)}>
            重试
          </Button>
        </p>
      ) : null}
      <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed">{t.card.text}</p>
      {t.card.text ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              void navigator.clipboard
                .writeText(t.card!.text)
                .then(() => setNotice("已复制译文"))
                .catch(() => setNotice("复制失败，请重试。"))
            }
          >
            复制译文
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              if (await save(t.card!.text, t.card!.selection)) {
                setNotice("已保存为批注说明");
              }
            }}
          >
            作为批注说明保存
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="mb-0 text-[0.75rem] text-wb-text-3">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
