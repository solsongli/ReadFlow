import { createContext, useContext, type ReactNode } from "react";
import { useWorkspace, type Workspace, type WorkspacePorts } from "../state/useCanvasWorkspace.js";
const Context = createContext<Workspace | null>(null);
export function CanvasProvider({ children, ...ports }: WorkspacePorts & { children: ReactNode }) {
  const value = useWorkspace(ports);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCanvases(): Workspace {
  const value = useContext(Context);
  if (!value) {
    throw new Error("CanvasProvider is required");
  }
  return value;
}
