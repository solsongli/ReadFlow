import { buildOcrPayload, buildTranslationPayload, buildRenderPayload, createDeveloperConfigResolver, resolveWorkflowDefaults, normalizeWorkflow, normalizeMathMode, workflowConstants } from "@/features/ingest/domain.js";
import { defaultModelBaseUrl, defaultModelName, defaultPaddleApiUrl } from "@/platform/config/runtime.js";
import type { TranslationDraft } from "@/features/credentials/domain.js";
import type { TranslationState } from "@/platform/contracts/workbench.js";

export type { TranslationError, TranslationResult } from "@/platform/contracts/workbench.js";
export function translationReady(draft: TranslationDraft) {
  return Boolean(draft.apiKey.trim() && draft.baseUrl.trim() && draft.model.trim());
}
export function translationPayload(draft: TranslationDraft, saved: Record<string, unknown>) {
  const constants = workflowConstants();
  const { developerConfigWithDefaults } = createDeveloperConfigResolver({ getDeveloperConfig: () => ({ ...saved, model: draft.model, baseUrl: draft.baseUrl, workers: Number(draft.workers) }),
    normalizeWorkflow, normalizeMathMode, defaults: resolveWorkflowDefaults(constants), defaultModelBaseUrl, defaultModelName });
  const developerConfig = developerConfigWithDefaults();
  return { workflow: "book", source: {},
    ocr: buildOcrPayload({ pageRanges: "", ocrProvider: "local", defaultPaddleApiUrl, constants }),
    translation: buildTranslationPayload({ developerConfig, modelApiKey: draft.apiKey, selectedGlossaryId: String(saved.glossaryId ?? ""), constants }),
    render: buildRenderPayload({ developerConfig, constants }), runtime: { timeout_seconds: developerConfig.timeoutSeconds } };
}
export function activeTranslation(value?: TranslationState) { return value?.status === "queued" || value?.status === "running"; }
export function translationProgress(value: TranslationState) {
  if (value.error?.code === "cancelled") return "翻译已取消";
  const phase = value.stage ? ({ ocr: "文字识别", translation: "翻译", render: "排版" }[value.stage] ?? "翻译") : "翻译中";
  return value.status === "queued" ? "排队中" : value.status === "running" ? `${phase}${value.percent == null ? "…" : ` ${Math.round(value.percent)}%`}` : value.status === "done" ? "翻译完成" : value.status === "failed" ? "翻译失败" : "未翻译";
}
