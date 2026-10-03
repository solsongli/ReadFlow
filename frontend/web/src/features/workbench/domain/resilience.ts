export function isLibraryUnavailable(error: unknown): boolean {
  const value = error && typeof error === "object" ? error as { status?: number; name?: string; message?: string } : {};
  return Boolean((value.status && value.status >= 500 && value.status < 600) || value.name === "NetworkError"
    || (value.name === "TypeError" && /fetch|network|load failed/i.test(value.message ?? "")));
}
export function retryDelay(attempt: number): number { return Math.min(30000, 1000 * 2 ** Math.max(0, Math.min(5, Math.floor(attempt)))); }
export function workbenchTitle(main: string, readerTitle?: string): string {
  const title = readerTitle || ({ library: "文献库", desk: "书桌", notes: "笔记", settings: "设置", review: "复习" } as Record<string, string>)[main];
  return title ? `${title} — ReadFlow` : "ReadFlow";
}
export function pdfFiles<T extends { name: string; type: string }>(files: readonly T[]): T[] {
  return files.filter((file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name));
}
export function dropDescription(entries: Array<{ name?: string; type?: string }>): string {
  const known = entries.filter((file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name ?? "")).length;
  if (known) return `松开以导入 ${known} 个 PDF`;
  return entries.some((file) => !file.type && !file.name) ? `松开以检查并导入 PDF（${entries.length} 个文件）` : "仅支持 PDF 文件";
}
