import { useEffect, type ReactNode } from "react";
import { useCanvases } from "@/features/thought-canvas/index.js";
import { useWb, useWorkbench } from "../context.js";
export function CanvasTabNames({ children }: { children: ReactNode }) {
  const workspace = useCanvases();
  const wb = useWorkbench();
  const tabs = useWb((state) => state.tabs);
  useEffect(() => {
    for (const tab of tabs) {
      const canvas = workspace.list.find((value) => value.id === tab.canvasId);
      if (canvas && canvas.name !== tab.title) {
        wb.store.actions.updateTab(tab.id, { title: canvas.name });
      }
    }
  }, [tabs, workspace.list]);
  return children;
}
