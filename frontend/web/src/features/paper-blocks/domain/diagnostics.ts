import type { BlockStatus, TranslationDiagnostic } from "./model.js";
export function translationDiagnostics(status: BlockStatus | null): TranslationDiagnostic[] {
  const values = [
    ...(status?.job?.diagnostics || []),
    ...(status?.result?.diagnostics || []),
    status?.job?.error?.details,
    status?.result?.error?.details,
  ].filter(Boolean) as TranslationDiagnostic[];
  const unique = new Map(values.map((value) => [JSON.stringify(value), value]));
  return [...unique.values()].slice(0, 20);
}
export const DIAGNOSTIC_STAGES: Readonly<Record<string, string>> = Object.freeze({
  extract: "提取",
  terms: "术语预处理",
  batch: "翻译批次",
  qa_retry: "质检重译",
  parse: "解析响应",
  render: "排版",
  cache: "缓存写入",
});
