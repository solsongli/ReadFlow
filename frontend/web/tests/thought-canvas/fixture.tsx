import { createRoot } from "react-dom/client";
import { CanvasProvider, CanvasView } from "@/features/thought-canvas/index.js";
createRoot(document.getElementById("root")!).render(
  <CanvasProvider groups={[]} open={() => {}} source={() => {}} deleted={() => {}}>
    <CanvasView id="large" />
  </CanvasProvider>,
);
