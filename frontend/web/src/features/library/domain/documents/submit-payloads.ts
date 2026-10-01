// 提交载荷组装（纯函数）：把详情表单的 overrides 叠到凭据基座上。

import type { OcrDocumentPayload, TranslateDocumentPayload } from "../types.js";
import { mergeTranslatePayload } from "../translation-ocr-reuse.js";

// 文档级入口与上传入口使用同一个本地 OCR 契约。历史配置或表单
// overrides 只能提供页码，不能重新引入在线 provider、Token 或 URL。
// 复用已完成 OCR 的翻译仍不携带 OCR 配置。
export function assembleTranslatePayload(
  overrides: TranslateDocumentPayload = {},
  buildTranslateConfig?: (pageRanges?: string) => TranslateDocumentPayload | Record<string, unknown>,
): TranslateDocumentPayload {
  const pageRanges = `${overrides?.ocr?.page_ranges || ""}`.trim();
  const base = (buildTranslateConfig?.(pageRanges) || {}) as TranslateDocumentPayload;
  const merged = mergeTranslatePayload(base, overrides);
  if (merged.workflow === "translate" && merged.source?.artifact_job_id) return merged;
  return { ...merged, ocr: { provider: "local", page_ranges: `${merged.ocr?.page_ranges || ""}`.trim() } };
}

export function assembleOcrPayload(
  overrides: OcrDocumentPayload = {},
  buildOcrConfig?: (pageRanges?: string) => OcrDocumentPayload | Record<string, unknown>,
): OcrDocumentPayload {
  const pageRanges = `${overrides?.ocr?.page_ranges || ""}`.trim();
  const base = (buildOcrConfig?.(pageRanges) || {}) as OcrDocumentPayload;
  return {
    ...base,
    workflow: "ocr",
    ocr: { provider: "local", page_ranges: `${overrides.ocr?.page_ranges ?? base.ocr?.page_ranges ?? ""}`.trim() },
  };
}
