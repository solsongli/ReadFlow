// 文档域的友好错误文案（纯函数，无副作用）。

import {
  blockedFavoriteCount,
  isDeleteBlockedByFavorites,
} from "./delete-blocked-favorites.js";

export type ErrorLike = {
  message?: string;
  status?: number;
  errorCode?: string;
  reason?: string;
} | string | null | undefined;

// 本地 OCR 无在线凭据。翻译模型校验与本地模块错误必须分别展示。
export function friendlyTranslateError(error: ErrorLike, { reusingOcr = false } = {}): string {
  const message = typeof error === "string" ? error : `${error?.message || error || ""}`;
  const errorCode = typeof error === "object" && error
    ? `${error.errorCode || error.reason || ""}`.trim()
    : "";
  const structured = `${errorCode} ${message}`;
  if (/OCR_PAGE_COVERAGE_MISMATCH/i.test(structured)) {
    return "现有 OCR 未覆盖所选页码，未自动重新识别。请先为缺失页码执行 OCR。";
  }
  if (/OCR_(?:JOB_NOT_FOUND|JOB_NOT_SUCCEEDED|ARTIFACT_MISSING|ARTIFACT_NOT_REUSABLE)/i.test(structured)) {
    return "现有 OCR 产物暂时无法复用，未自动重新识别。请重新执行 OCR 后再试。";
  }
  if (isLocalOcrModuleError(structured)) return localOcrModuleMessage(message);
  if (!reusingOcr && /(?:paddle|mineru)[_. -]?token|ocr[_. -]?(?:token|credential)/i.test(structured)) {
    return "本地 OCR 不需要在线凭据；当前 OCR 提交配置不匹配，请检查本地 OCR 模块状态。";
  }
  const credentialish = /(token|key|凭据|令牌|密钥|credential)/i.test(message);
  const missing = /(required|需要|缺|未配置|not configured|missing)/i.test(message);
  if (credentialish && missing) {
    return "翻译需要先在「设置」里配置翻译 API 后再试。";
  }
  return message || "发起翻译失败，请稍后重试。";
}

function isLocalOcrModuleError(message: string): boolean {
  return /OCR_NOT_READY|OCR_MODULE_(?:MISSING|NOT_READY)|扫描页需要本地 OCR 模块|本地 OCR 模块不可用/i.test(message);
}

function localOcrModuleMessage(message: string): string {
  return /扫描页需要本地 OCR 模块|本地 OCR 模块不可用/.test(message)
    ? message
    : "扫描页需要本地 OCR 模块，请在「设置 → 接口设置 → 本地 OCR 识别」安装后重试。";
}

export function friendlyOcrError(error: ErrorLike): string {
  const message = typeof error === "string" ? error : `${error?.message || error || ""}`;
  const code = typeof error === "object" && error ? `${error.errorCode || error.reason || ""}` : "";
  if (isLocalOcrModuleError(`${code} ${message}`)) return localOcrModuleMessage(message);
  // In particular, a module error saying "无需 Token" is not a request for
  // credentials. Preserve the backend's actionable error instead of guessing.
  return message || "发起本地 OCR 失败，请检查本地 OCR 模块状态后重试。";
}

export function friendlyDocumentDeleteError(error: ErrorLike): string {
  const message = typeof error === "string" ? error : `${error?.message || error || ""}`;
  const status = typeof error === "object" && error ? error.status : undefined;
  if (isDeleteBlockedByFavorites(error) || status === 409 || message.includes("(409)")) {
    // 结构化字段优先；message 正则只作为旧错误源的兜底。
    const structured = blockedFavoriteCount(error);
    const count = structured > 0 ? structured : Number(message.match(/\d+/)?.[0]);
    return Number.isFinite(count) && count > 0
      ? `该文档有 ${count} 条收藏，请先删除收藏后再删除文档。`
      : "该文档存在收藏引用，请先删除相关收藏后再删除文档。";
  }
  return message || "删除文档失败";
}
