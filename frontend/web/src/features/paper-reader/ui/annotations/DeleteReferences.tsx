import { useRef } from "react";
import { useReaderDialogFocus } from "../../state/useReaderDialogFocus.js";
import { Button } from "@/ui/wb/Button.js";
import type { AnnotationController } from "../../state/annotations/useAnnotations.js";
export function DeleteReferences({ controller: c }: { controller: AnnotationController }) {
  const root = useRef<HTMLDivElement>(null);
  useReaderDialogFocus(root, Boolean(c.deletion), () => c.setDeletion(null));
  if (!c.deletion) {
    return null;
  }
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="处理画布引用"
      className="absolute inset-0 z-50 flex items-center justify-center bg-wb-overlay p-4"
    >
      <div className="max-w-md space-y-3 rounded-xl bg-wb-panel p-5 shadow-wb-pop">
        <p>
          该批注在 {c.deletion.count} 个画布中被引用；有 {c.deletion.cards ?? 0} 张闪卡引用了它。
        </p>
        <p className="text-[0.8125rem] text-wb-text-3">保留时会转为静态摘录，并标明原批注已删除。</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={c.busy} onClick={() => void c.confirmDeletion("keep")}>
            保留为静态摘录
          </Button>
          <Button disabled={c.busy} onClick={() => void c.confirmDeletion("remove")}>
            一并删除画布卡和闪卡
          </Button>
          <Button onClick={() => c.setDeletion(null)}>取消</Button>
        </div>
      </div>
    </div>
  );
}
