// ingest 的「非 React」出口。
//
// 供装配层与跨页调用方（如 js/bootstrap/job-domain-adapters）使用；
// React 侧从 index.ts 导入。index.ts 逐条转出本文件，两处不会漂移。
// 逐条显式列举，不用 export * —— barrel 无差别转出会连带触发模块级副作用。

export {
  clearAppliedPageRange,
  createUploadStatePort,
  createUploadStore,
  getUploadState,
  getUploadStatePort,
  resetUploadState,
  setAppliedPageRange,
  setUploadState,
  setUploadSubmitBusy,
} from "./domain/upload/state.js";
export type {
  UploadActions,
  UploadPayload,
  UploadResetOptions,
  UploadState,
  UploadStatePort,
  UploadStore,
} from "./domain/upload/state.js";









export { createDeveloperConfigResolver, resolveWorkflowDefaults } from "./domain/workflow/developer-config.js";












export {
  normalizeMathMode,
  normalizeWorkflow,
  workflowConstants,
  WORKFLOW_BOOK,
  WORKFLOW_OCR,
  WORKFLOW_RENDER,
  WORKFLOW_TRANSLATE,
} from "./domain/workflow-config.js";

export { buildOcrPayload, buildTranslationPayload, buildRenderPayload } from "./domain/workflow/payload.js";
