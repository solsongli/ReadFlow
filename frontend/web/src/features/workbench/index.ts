// ReadFlow 工作台功能入口：app 层只经此处装配。
export { createWorkbench, type Workbench, type WorkbenchEnv } from "./state/controller.js";
export { WorkbenchProvider } from "./ui/context.js";
export { WorkbenchShell } from "./ui/shell/WorkbenchShell.js";
