import { createContext, useContext, type ReactNode } from "react";
import { useStoreSnapshot } from "@/ui/hooks/use-store.js";
import type { Workbench } from "../state/controller.js";
import type { WorkbenchState } from "../domain/workbench-store.js";

const WorkbenchContext = createContext<Workbench | null>(null);

export function WorkbenchProvider({ workbench, children }: { workbench: Workbench; children: ReactNode }) {
  return <WorkbenchContext.Provider value={workbench}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench(): Workbench {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error("useWorkbench must be used inside <WorkbenchProvider>.");
  return value;
}

/** Subscribe to a slice of workbench state; re-renders only when the slice changes (shallow). */
export function useWb<T>(selector: (state: WorkbenchState) => T): T {
  const { store } = useWorkbench();
  return useStoreSnapshot(store, selector) as T;
}
