import { useState } from "react";
import { Button } from "@/ui/Button.js";
import { ConfirmDialog } from "@/ui/components/confirm-dialog.js";
import type { ResearchLibraryApi } from "@/platform/api/research-library.js";
import type { ImportPayload, ImportPlan, ImportResult, ImportWarning } from "@/platform/contracts/research-library.js";
import { buildImportPayload, countConflicts, readableError } from "../domain/model.js";
import { ResearchDialog } from "./ResearchDialog.js";

export function ResearchImportDialog({ api, onClose, onImported }: {
  api: ResearchLibraryApi; onClose: () => void; onImported: (result: ImportResult) => void;
}) {
  const [source, setSource] = useState("zotero-json-library");
  const [raw, setRaw] = useState<unknown>(null);
  const [filename, setFilename] = useState("");
  const [payload, setPayload] = useState<ImportPayload | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function select(file?: File) {
    if (!file) return;
    setRaw(null); setPlan(null); setPayload(null); setResult(null); setError(""); setFilename(file.name);
    if (file.size > 20 * 1024 * 1024) { setError("首版支持 20 MB 以内的 JSON，大库请先导出一个合集。"); return; }
    try {
      const value = JSON.parse(await file.text()); setRaw(value);
      if (value && !Array.isArray(value) && typeof value.source_id === "string" && value.source_id.trim()) setSource(value.source_id.trim());
    } catch { setError("文件不是有效 JSON；请选择 Zotero CSL JSON 导出或 API JSON 快照。"); }
  }
  async function preview() {
    setError(""); setPending(true);
    try { const next = buildImportPayload(raw, source); setPayload(next); setPlan(await api.previewImport(next)); }
    catch (e) { setError(readableError(e)); setPlan(null); } finally { setPending(false); }
  }
  async function commit() {
    if (!payload || !plan) return;
    setError(""); setPending(true);
    try { const next = await api.commitImport(payload, plan.plan_hash); setResult(next); setConfirm(false); onImported(next); }
    catch (e) { setError(readableError(e)); setConfirm(false); } finally { setPending(false); }
  }
  return <ResearchDialog title="从 Zotero / JSON 迁移文献" onClose={onClose} pending={pending}>
    {!result && <>
      <p className="research-muted">在 Zotero 中导出 CSL JSON，或选择保存的 API JSON 快照。来源只读，先预览再确认；重复导入沿用同一来源名称。</p>
      <label className="research-field">固定来源名称<input aria-label="迁移来源名称" maxLength={200} value={source} disabled={pending} onChange={(e) => { setSource(e.target.value); setPlan(null); }} /></label>
      <label className="research-field">选择 JSON 文件<input aria-label="Zotero JSON 文件" data-testid="native-json-input" type="file" accept=".json,application/json" disabled={pending} onChange={(e) => void select(e.target.files?.[0])} /></label>
      {filename && <p className="research-muted">{filename}</p>}
      <Button variant="outline" onClick={() => void preview()} disabled={pending || raw === null}>{pending ? "读取中…" : "预览导入"}</Button>
      <div className="research-notice">CSL JSON 主要迁移书目，不能完整保留合集、附件、复杂批注、插件数据或 Word 引用关系。Zotero 官方浏览器 Connector 直连尚未验证；本页提供可验证的 JSON 迁移入口。</div>
    </>}
    {error && <div className="research-error" role="alert">{error}</div>}
    {plan && !result && <section className="research-import-preview" data-testid="native-import-preview">
      <h3>导入预览</h3><p className="research-muted">{plan.source_kind} · {plan.source_id}</p>
      <div className="research-counts">{Object.entries({ 文献: plan.counts.items, 合集: plan.counts.collections, 标签: plan.counts.tags, 附件声明: plan.counts.attachments, 笔记: plan.counts.notes, 批注: plan.counts.annotations }).map(([key, count]) => <div key={key}><strong>{count}</strong><span>{key}</span></div>)}</div>
      <p className="research-muted">预览计数包含来源声明，不代表附件或复杂批注均已实际迁移。</p>
      <ul className="research-preview-titles">{plan.items.slice(0, 12).map((entry, index) => <li key={index}>{String(entry.title || entry.source_key || "无标题文献")}</li>)}</ul>
      {plan.items.length > 12 && <p className="research-muted">另外 {plan.items.length - 12} 篇文献</p>}
      <MigrationWarnings warnings={plan.warnings} />
      <Button variant="default" disabled={pending || !plan.counts.items} onClick={() => setConfirm(true)}>确认导入此预览</Button>
    </section>}
    {result && <section data-testid="native-import-result"><div className="research-success" role="status">导入完成：新增 {result.created_items} 篇，更新 {result.updated_items} 篇，保持不变 {result.unchanged_items} 篇。</div>
      {countConflicts(result.conflicts) > 0 && <div className="research-notice">{countConflicts(result.conflicts)} 项冲突已报告，已有修改不会被静默覆盖。</div>}
      <MigrationWarnings warnings={result.warnings} /><p className="research-muted">批次：{result.batch_id}</p><Button variant="default" onClick={onClose}>返回文献管理</Button>
    </section>}
    <ConfirmDialog id="research-import-confirm" title="确认迁移到本地文献库" description={`将导入预览中的 ${plan?.counts.items || 0} 篇文献。来源不会改写；缺失附件与未覆盖字段见迁移报告。`} confirmLabel="确认导入" tone="info" level="nested" open={confirm} pending={pending} onOpenChange={setConfirm} onConfirm={commit} />
  </ResearchDialog>;
}
export function MigrationWarnings({ warnings = [] }: { warnings?: ImportWarning[] }) {
  if (!warnings.length) return <p className="research-muted">本次未报告缺失字段；这不代表全部 Zotero 功能均已迁移。</p>;
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(warnings, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "retainpdf-migration-warnings.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <details className="research-warnings" open><summary>迁移提示（{warnings.length}）</summary><ul>{warnings.slice(0, 100).map((entry, index) =>
    <li key={index}>{entry.message}{entry.source_key && <span className="research-muted"> · {entry.source_key}</span>}</li>
  )}</ul>{warnings.length > 100 && <p>其余 {warnings.length - 100} 条包含在完整提示 JSON 中。</p>}<Button variant="outline" onClick={download}>下载完整迁移提示 JSON</Button></details>;
}
