import { useCallback, useState } from "react";
import { api } from "./api";
import { Dialog } from "./Dialog";
import { buildImportPayload, countConflicts, readableError } from "./model";
import type { ImportPayload, ImportPlan, ImportResult } from "./types";

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (result: ImportResult) => void }) {
  const [sourceId, setSourceId] = useState("zotero-csl-local");
  const [localSourceId, setLocalSourceId] = useState("");
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState<unknown>(null);
  const [payload, setPayload] = useState<ImportPayload | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  async function selectFile(file?: File) {
    if (!file) return;
    setPlan(null); setResult(null); setPayload(null); setError(""); setRaw(null); setFileName(file.name);
    if (file.size > 20 * 1024 * 1024) { setError("首版支持 20 MB 以内的 JSON；大库请先导出一个合集。"); return; }
    try {
      const parsed = JSON.parse(await file.text()); setRaw(parsed);
      if (parsed && !Array.isArray(parsed) && (parsed.format === "zotero-api" || parsed.format === "csl-json") && typeof parsed.source_id === "string" && parsed.source_id.trim()) setSourceId(parsed.source_id.trim());
    } catch { setError("文件不是有效的 JSON，请使用 Zotero 的 CSL JSON 导出或 API JSON 快照。"); }
  }
  async function preview() {
    setError(""); setBusy(true); setResult(null);
    try {
      const next = buildImportPayload(raw, sourceId);
      const nextPlan = await api.previewImport(next);
      setPayload(next); setPlan(nextPlan);
    } catch (e) { setError(readableError(e)); setPlan(null); }
    finally { setBusy(false); }
  }
  async function readLocal() {
    if (!localSourceId.trim()) { setError("请为本机 Zotero 库填写专用固定名称，不同库请使用不同名称。"); return; }
    setError(""); setBusy(true); setResult(null); setPlan(null); setPayload(null); setRaw(null);
    try {
      const next = await api.localZoteroPreview(localSourceId);
      setPayload(next.payload); setPlan(next.plan); setFileName("本机 Zotero 只读快照");
    } catch (e) { setError(readableError(e)); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!payload || !plan) return;
    setError(""); setBusy(true);
    try { const next = await api.commitImport(payload, plan.plan_hash); setResult(next); onImported(next); }
    catch (e) { setError(readableError(e)); }
    finally { setBusy(false); }
  }
  return <Dialog title="从 Zotero / CSL JSON 导入" onClose={close} wide>
    <p className="subtle">先预览，再写入本地文献库。来源保持只读；重复导入请沿用同一来源名称。</p>
    {!result && <><div className="import-paths">
      <section><h3>选择导出文件</h3><p>在 Zotero 中导出为 CSL JSON，或选择保存的 API JSON 快照。</p>
        <label className="field">固定来源名称<input value={sourceId} maxLength={200} onChange={(e) => { setSourceId(e.target.value); setPlan(null); }} disabled={busy} /></label>
        <label className="file-control">JSON 文件<input data-testid="json-input" type="file" accept=".json,application/json" disabled={busy} onChange={(e) => { void selectFile(e.target.files?.[0]); }} /></label>
        {fileName && <p className="selected-file">{fileName}</p>}
        <button onClick={() => void preview()} disabled={busy || raw === null}>{busy ? "读取中…" : "预览文件导入"}</button>
      </section>
      <section><h3>连接本机 Zotero</h3><p>打开 Zotero，在“设置 → 高级”允许其他应用访问。点击后仅向本机 23119 端口发起只读请求。</p>
        <label className="field">本机库专用名称<input aria-label="本机 Zotero 库专用名称" value={localSourceId} maxLength={200} placeholder="例如：我的博士课题库" onChange={(e) => { setLocalSourceId(e.target.value); setPlan(null); }} disabled={busy} /></label>
        <p className="subtle">重复导入沿用同一名称，不同库请使用不同名称。Zotero 10 优先使用真实实例 ID；旧版需此名称区分来源。</p>
        <button onClick={() => void readLocal()} disabled={busy || !localSourceId.trim()}>{busy ? "读取中…" : "读取本机 Zotero（只读）"}</button>
        <p className="subtle">未运行或未开放接口时，可使用左侧导出文件。</p>
      </section>
    </div>
    <div className="notice warning">CSL JSON 主要迁移书目信息，无法完整保留合集、附件、批注或 Word 引用关系。API 快照的未支持字段及缺失附件会在预览中列出；首版不导入插件专有数据。</div></>}
    {error && <div className="notice error" role="alert">{error}</div>}
    {plan && !result && <section className="import-preview" data-testid="import-preview">
      <div className="section-heading"><h3>导入预览</h3><span className="badge">{plan.source_kind}</span></div>
      <p className="subtle">来源：{plan.source_id}</p>
      <div className="import-counts">{Object.entries({ 文献: plan.counts.items, 合集: plan.counts.collections, 标签: plan.counts.tags, 附件: plan.counts.attachments, 笔记: plan.counts.notes, 批注: plan.counts.annotations }).map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
      <div className="preview-items">{plan.items.slice(0, 12).map((entry, index) => <p key={index}>{String(entry.title || entry.source_key || "无标题文献")}</p>)}{plan.items.length > 12 && <p className="subtle">另外 {plan.items.length - 12} 篇文献</p>}</div>
      <WarningList warnings={plan.warnings} />
      <div className="form-footer"><button className="primary" onClick={() => void commit()} disabled={busy || !plan.counts.items}>{busy ? "导入中…" : "确认导入此预览"}</button><span className="subtle">不修改 Zotero 来源</span></div>
    </section>}
    {result && <section data-testid="import-result"><div className="notice success" role="status">导入完成：新增 {result.created_items} 篇，更新 {result.updated_items} 篇，保持不变 {result.unchanged_items} 篇。</div>
      {countConflicts(result.conflicts) > 0 && <div className="notice warning">{countConflicts(result.conflicts)} 项存在冲突，请根据报告检查；已有修改不会被静默覆盖。</div>}
      <WarningList warnings={result.warnings} />
      <p className="subtle">批次：{result.batch_id}</p><button className="primary" onClick={onClose}>返回文献库</button>
    </section>}
  </Dialog>;
}
function WarningList({ warnings = [] }: { warnings?: ImportPlan["warnings"] }) {
  return warnings.length > 0 ? <details className="warnings" open><summary>需要留意的迁移信息（{warnings.length}）</summary><ul>{warnings.slice(0, 200).map((warning, index) =>
    <li key={index}><span className="warning-code">{warning.code}</span> {warning.message}{warning.source_key && <span className="subtle"> · {warning.source_key}</span>}</li>
  )}</ul>{warnings.length > 200 && <p>其余 {warnings.length - 200} 条见下方 JSON 报告。</p>}<button onClick={() => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(warnings, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "retainpdf-import-warnings.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }}>下载完整迁移提示 JSON</button></details> : <p className="subtle">本次预览没有报告缺失字段；这不代表全部 Zotero 功能均已迁移。</p>;
}
