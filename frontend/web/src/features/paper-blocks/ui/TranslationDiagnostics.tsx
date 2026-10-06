import type { TranslationDiagnostic } from "../domain/model.js";
import { DIAGNOSTIC_STAGES } from "../domain/diagnostics.js";
export function TranslationDiagnostics({ values }: { values: TranslationDiagnostic[] }) {
  if (!values.length) return null;
  return (
    <details className="mt-2 text-xs text-wb-text-3">
      <summary className="cursor-pointer">查看详情</summary>
      <p>以下仅含阶段、异常类型与状态码。</p>
      <ul className="space-y-2 pl-4">
        {values.map((value, index) => (
          <li key={index}>
            {DIAGNOSTIC_STAGES[value.stage] || value.stage} · {value.exception}
            {value.http_status ? ` · HTTP ${value.http_status}` : ""}
            {value.provider_code ? ` · 服务错误码 ${value.provider_code}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}
