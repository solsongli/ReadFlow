import { Layers } from "lucide-react";
import { reviewQueue } from "../domain/model.js";
import { useFlashcards } from "./context.js";
export function ReviewEntry({
  widget = false,
  collapsed = false,
}: {
  widget?: boolean;
  collapsed?: boolean;
}) {
  const w = useFlashcards();
  if (!w) return null;
  const count = reviewQueue(w.cards, w.logs, w.day, w.limits.newCards, w.limits.reviews).length;
  return (
    <button
      type="button"
      aria-label="复习"
      title="复习"
      onClick={w.open}
      className={`flex items-center gap-2 rounded-lg border-0 bg-transparent p-2 text-left hover:bg-wb-hover ${count ? "text-wb-text" : "text-wb-text-3"}`}
    >
      <Layers size={17} className="shrink-0 text-wb-link" />
      {!collapsed ? (
        <>
          <span className="flex-1">{widget ? "今日复习 · 开始复习" : "复习"}</span>
          <span>{count}</span>
        </>
      ) : null}
    </button>
  );
}
