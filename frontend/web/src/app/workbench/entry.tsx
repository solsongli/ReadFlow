// ReadFlow 工作台入口（产物 dist/workbench.bundle.js，由 workbench.html 挂载）。
// 与旧三页独立：不加载装饰主题、job-domain 适配器或旧主页 composition。不开 StrictMode（与三页约定一致）。
import { createRoot } from "react-dom/client";
import { workbenchApi } from "@/platform/api/workbench.js";
import { createWorkbench, WorkbenchProvider, WorkbenchShell } from "@/features/workbench/index.js";

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function bootWorkbench() {
  let host = document.getElementById("workbench-root");
  if (!host) {
    host = document.createElement("div");
    host.id = "workbench-root";
    document.body.appendChild(host);
  }
  const workbench = createWorkbench({ api: workbenchApi, storage: browserStorage() });
  createRoot(host).render(
    <WorkbenchProvider workbench={workbench}>
      <WorkbenchShell />
    </WorkbenchProvider>,
  );
}

bootWorkbench();
