export interface AssistanceError {
  code: string;
  message: string;
}
export interface AiStatus {
  service: string;
  model: string;
  target: string;
  external_models_allowed: boolean;
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  page: number;
}
export interface Conversation {
  messages: ChatMessage[];
  consent_target: string;
  generation: number;
}
export interface ReaderContext {
  page: number;
  page_text: string;
  selection: string;
}
export interface AssistancePorts {
  translationConfig: () => Promise<{ translation: Record<string, unknown>; service: string }>;
  settings: (section: "translation" | "ai") => void;
  note: (body: string) => Promise<void>;
  canvas: (body: string) => void;
}
export function pageCitations(text: string, pages: number) {
  return [...text.matchAll(/\(p\.\s*(\d+)\)|（第\s*(\d+)\s*页）/gi)]
    .map((match) => ({ text: match[0], index: match.index!, page: Number(match[1] || match[2]) }))
    .filter((value) => value.page >= 1 && value.page <= pages);
}
export function needsConsent(saved: string, status: AiStatus | null, session = "") {
  return !status || (saved !== status.target && session !== status.target);
}
export function translationCacheKey(text: string, config: Record<string, unknown>) {
  return JSON.stringify([
    text,
    config.base_url,
    config.model,
    config.glossary_id || "",
    config.glossary_entries || [],
  ]);
}
export const AI_OFFLINE = "本地 AI 服务未运行。AI 伴读需要它在后台运行；正式版启动时会自动开启。";
export function assistanceError(value: unknown, ai = false): AssistanceError {
  const error = value as Partial<AssistanceError> & { status?: number };
  if (
    ai &&
    (error?.code === "ai_offline" ||
      (!error?.code && [502, 503].includes(error?.status ?? 0)) ||
      value instanceof TypeError)
  ) {
    return { code: "ai_offline", message: AI_OFFLINE };
  }
  const known: Record<string, string> = {
    glossary_unavailable: "当前术语表无法读取，请在设置中检查启用的术语表。",
    overview_format: "导读格式不完整，请重新生成。",
    overview_empty: "尚未识别到论文文字，请先进行本地 OCR。",
    reader_busy: "已有回答正在生成，请稍后重试。",
    INVALID_FIELD: "选中内容或问题过长，请缩短后重试。",
    ai_config_error: "AI 运行时设置读取失败，请重试。",
    unconfigured: "还没有配置翻译服务",
    credentials: "模型服务的 Key 无效或没有访问权限。",
    quota: "服务额度不足或请求过于频繁，请稍后重试。",
    model: "所选模型不存在或当前服务不支持它。",
    network: "无法连接模型服务或请求超时，请检查网络连接和服务地址。",
    external_disabled: "本机服务未启用外部模型调用。",
    consent_changed: "服务配置已变化，请重新确认发送范围。",
    consent_required: "发送前需要确认上下文范围。",
    runtime_mode: "当前 FX 运行模式暂不支持阅读器上下文对话，请在 AI 设置切换模式。",
    runtime_pending: "AI 设置正在应用，请稍后重试。",
  };
  return {
    code: error?.code || "other",
    message:
      ai && error?.code === "unconfigured"
        ? "还没有配置 AI 伴读模型，请前往设置。"
        : known[error?.code || ""] || "请求未能完成，请重试或检查设置。",
  };
}
