import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
export type SettingsSection = "general" | "translation" | "ocr" | "ai" | "glossaries" | "library" | "about";
export const SETTINGS_SECTIONS: ReadonlyArray<{ id: SettingsSection; title: string; description: string }> = [
  { id: "general", title: "通用", description: "让 ReadFlow 按你的习惯打开和显示。" },
  { id: "translation", title: "翻译", description: "配置阅读器与翻译任务共用的服务。" },
  { id: "ocr", title: "本地 OCR", description: "在本机识别扫描文献的文字。" },
  { id: "ai", title: "AI 伴读", description: "设置问答模型、运行方式与操作确认。" },
  { id: "glossaries", title: "术语表", description: "保持专业术语的译法一致。" },
  { id: "library", title: "文献库", description: "查看文献统计与导入选项。" },
  { id: "about", title: "关于 ReadFlow", description: "面向科研的文献管理、双语阅读与笔记工具" },
];
export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "未知";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
export function moduleSources(files: Array<{ url: string }>): string[] {
  return [...new Set(files.map(({ url }) => { try { return new URL(url).origin; } catch { return "未知来源"; } }))];
}
export function librarySettingsStats(rows: WorkbenchRow[], groups: number) {
  return { papers: rows.length, attachments: rows.reduce((n, row) => n + row.attachment_count, 0), notes: rows.reduce((n, row) => n + row.notes_count, 0), groups };
}
export function safeSettingsMessage(message: string, values: string[]): string {
  let safe = message;
  for (const value of values) if (value) safe = safe.split(value).join("[已隐藏]");
  return safe;
}

export function agentSettingsReadError(failure: unknown): string {
  const error = failure && typeof failure === "object" ? failure as { status?: unknown; name?: unknown; message?: unknown } : {};
  const message = typeof error.message === "string" ? error.message : "";
  const unavailable = error.status === 502 || error.status === 503 || /\((502|503)\)\s*$/.test(message)
    || error.name === "NetworkError" || (error.name === "TypeError" && /fetch|network|load failed/i.test(message));
  return unavailable ? "本地 AI 服务未运行。AI 伴读需要它在后台运行；正式版启动时会自动开启。" : "AI 运行时设置读取失败，请重试。";
}
