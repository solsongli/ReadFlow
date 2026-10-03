import { useFlashcards } from "@/features/flashcards/index.js";
import type { Annotation } from "../../domain/annotations/types.js";
export function CardBadges({ rows }: { rows: Annotation[] }) {
  const cards = useFlashcards();
  return (
    <>
      {rows.map((row) => {
        const linked = cards?.cards.filter((card) => card.annotation_id === row.id);
        const rect = row.rects[0];
        if (!linked?.length || !rect) return null;
        return (
          <button
            key={row.id}
            type="button"
            title={`${linked.length} 张闪卡`}
            aria-label="打开关联闪卡"
            className="absolute z-20 rounded border-0 bg-wb-panel px-1 text-[0.625rem] text-wb-link shadow-wb-card"
            style={{
              left: `${Math.min(0.88, rect.x + rect.width) * 100}%`,
              top: `calc(${rect.y * 100}% + 1.2rem)`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              cards?.edit(linked[0]);
            }}
          >
            卡
          </button>
        );
      })}
    </>
  );
}
