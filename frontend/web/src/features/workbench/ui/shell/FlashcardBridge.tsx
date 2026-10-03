import type { ReactNode } from "react";
import { FlashcardProvider } from "@/features/flashcards/index.js";
import { useWb, useWorkbench } from "../context.js";
export function FlashcardBridge({ children }: { children: ReactNode }) {
  const wb = useWorkbench();
  const groups = useWb((s) => s.list.result?.groups ?? []);
  const newCards = useWb((s) => s.reviewNewLimit);
  const reviews = useWb((s) => s.reviewLimit);
  return (
    <FlashcardProvider
      groups={groups}
      limits={{ newCards, reviews }}
      open={() => wb.setMain("review")}
      source={(source) =>
        void wb.openReader(source.item_id, {
          page: source.page,
          annotationId: source.annotation_id || undefined,
        })
      }
    >
      {children}
    </FlashcardProvider>
  );
}
