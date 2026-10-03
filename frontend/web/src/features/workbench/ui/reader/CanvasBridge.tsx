import { CanvasTabNames } from "./CanvasTabNames.js";
import type { ReactNode } from "react";
import { CanvasProvider } from "@/features/thought-canvas/index.js";
import { useWb, useWorkbench } from "../context.js";
export function CanvasBridge({ children }: { children: ReactNode }) {
  const wb = useWorkbench();
  const groups = useWb((state) => state.list.result?.groups ?? []);
  return (
    <CanvasProvider
      groups={groups}
      open={(id, title, focusNode) => {
        if (wb.store.getSnapshot().main === "settings") {
          wb.store.actions.patch({ main: "library" });
        }
        const key = `canvas:${id}`;
        const existing = wb.store.getSnapshot().tabs.find((tab) => tab.id === key);
        wb.store.actions.openTab({
          id: key,
          itemId: "",
          title,
          url: null,
          status: "ready",
          error: null,
          kind: "canvas",
          canvasId: id,
          canvasNode: focusNode,
          navigationKey: (existing?.navigationKey ?? 0) + 1,
        });
      }}
      deleted={(id) => wb.closeTab(`canvas:${id}`)}
      source={(target) => {
        void wb.openReader(target.itemId, { page: target.page, annotationId: target.annotationId });
      }}
    >
      <CanvasTabNames>{children}</CanvasTabNames>
    </CanvasProvider>
  );
}
