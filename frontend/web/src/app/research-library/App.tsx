import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, exportUrl } from "./api";
import { Dialog } from "./Dialog";
import { ImportDialog } from "./ImportDialog";
import { MetadataForm } from "./MetadataForm";
import { EMPTY_ITEM, itemInput, readableError } from "./model";
import { PdfReader, type ReaderJump } from "./PdfReader";
import type { AiStatus, Collection, EvidenceResult, ImportResult, ItemInput, PaperItem } from "./types";

type Modal = "import" | "new-item" | "collection" | null;
type Tab = "reader" | "metadata" | "evidence";
export function App() {
  const [items, setItems] = useState<PaperItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [tag, setTag] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [item, setItem] = useState<PaperItem | null>(null);
  const selection = useRef(selectedId); selection.current = selectedId;
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [tab, setTab] = useState<Tab>("reader");
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [jump, setJump] = useState<ReaderJump | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const [collectionName, setCollectionName] = useState("");
  const [collectionParent, setCollectionParent] = useState("");
  const [evidenceQuery, setEvidenceQuery] = useState("");
  const [evidence, setEvidence] = useState<EvidenceResult | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const notify = useCallback((message: string, error = false) => setNotice({ message, error }), []);
  useEffect(() => { const timer = window.setTimeout(() => setSearch(query), 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    const controller = new AbortController(); setListLoading(true);
    api.items(search, collectionId, controller.signal).then((result) => {
      setItems(result.items); setCollections(result.collections); setTags(result.tags);
      setSelectedId((current) => result.items.some((entry) => entry.id === current) ? current : result.items[0]?.id || null);
    }).catch((error) => { if (error.name !== "AbortError") notify(readableError(error), true); }).finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [search, collectionId, revision, notify]);
  useEffect(() => {
    let active = true;
    if (!selectedId) { setItem(null); return; }
    setItem((current) => current?.id === selectedId ? current : null);
    setDetailLoading(true);
    api.item(selectedId).then((next) => { if (active) setItem(next); }).catch((error) => { if (active) { setItem(null); notify(readableError(error), true); } }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId, revision, notify]);
  useEffect(() => {
    setEvidence(null); setEvidenceQuery(""); setJump(null); setTab("reader");
  }, [selectedId]);
  useEffect(() => {
    let active = true;
    api.aiStatus().then((next) => { if (active) setAi(next); }).catch(() => { if (active) setAi({ status: "not-verified", model_verified: false, message: "暂时无法读取模型状态；真实模型尚未验证。" }); });
    return () => { active = false; };
  }, []);
  const visibleItems = useMemo(() => tag ? items.filter((entry) => entry.tags.includes(tag)) : items, [items, tag]);
  useEffect(() => {
    if (tag && !visibleItems.some((entry) => entry.id === selectedId)) setSelectedId(visibleItems[0]?.id || null);
  }, [tag, visibleItems, selectedId]);
  const reloadSelected = useCallback(async () => {
    if (!selectedId) return;
    const next = await api.item(selectedId);
    if (selection.current === selectedId) { setItem(next); setItems((current) => current.map((entry) => entry.id === next.id ? next : entry)); }
  }, [selectedId]);
  async function saveItem(value: ItemInput, creating = false) {
    setBusy(true);
    try {
      const next = creating ? await api.createItem(value) : await api.updateItem(item!.id, value);
      setSelectedId(next.id); setItem(next); setRevision((current) => current + 1);
      if (creating) { setModal(null); setCollectionId(""); setTag(""); setQuery(""); setSearch(""); }
      notify(creating ? "文献已创建，可继续关联 PDF。" : "文献信息与分类已保存。");
    } catch (error) { notify(readableError(error), true); } finally { setBusy(false); }
  }
  async function upload(files: FileList | null, attach = false) {
    if (!files?.length) return;
    if (attach && (!item || item.id !== selectedId || detailLoading)) { notify("请等待当前文献加载完成后再关联 PDF。", true); return; }
    const target = attach ? item!.id : undefined;
    setBusy(true); let last: PaperItem | null = null; let completed = 0;
    try {
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("请导入 PDF 文件。");
        const result = await api.upload(file, target);
        last = "item" in result ? result.item : result; completed++;
      }
      if (last) { setItem(last); setSelectedId(last.id); }
      setCollectionId(""); setTag(""); setQuery(""); setSearch(""); setTab("reader");
      notify(attach ? "PDF 已关联，来源文件保持不变。" : `已导入 ${completed} 个 PDF。`);
    } catch (error) { notify(`${completed ? `已完成 ${completed} 个文件；` : ""}${readableError(error)}`, true); }
    finally { setRevision((current) => current + 1); setBusy(false); if (pdfInput.current) pdfInput.current.value = ""; if (attachmentInput.current) attachmentInput.current.value = ""; }
  }
  async function createCollection() {
    setBusy(true);
    try { await api.createCollection(collectionName.trim(), collectionParent || null); setModal(null); setCollectionName(""); setRevision((current) => current + 1); notify("合集已创建，可在文献信息中加入文献。"); }
    catch (error) { notify(readableError(error), true); } finally { setBusy(false); }
  }
  function imported(result: ImportResult) {
    setRevision((current) => current + 1); setCollectionId(""); setTag(""); setQuery(""); setSearch("");
    notify(`导入完成：新增 ${result.created_items} 篇，更新 ${result.updated_items} 篇，保持不变 ${result.unchanged_items} 篇。`);
  }
  async function searchEvidence(event: React.FormEvent) {
    event.preventDefault(); if (!item || !evidenceQuery.trim()) return;
    const target = item.id; setEvidenceBusy(true);
    try { const next = await api.evidence(target, evidenceQuery.trim()); if (selection.current === target) { setEvidence(next); await reloadSelected(); } }
    catch (error) { notify(readableError(error), true); } finally { setEvidenceBusy(false); }
  }
  function openCitation(attachmentId: string, pageIdx: number) {
    setJump({ attachmentId, pageIdx, serial: Date.now() }); setTab("reader");
  }
  const activeCollection = collections.find((entry) => entry.id === collectionId);
  return <div className="research-app">
    <aside className="library-sidebar">
      <a className="brand" href="/research-library.html"><span className="brand-mark">r<span>p</span></span><span>RetainPDF<small>科研文献库 · 本地首版</small></span></a>
      <div className="sidebar-section"><div className="sidebar-label">我的文献</div><button className={`sidebar-entry ${!collectionId && !tag ? "active" : ""}`} onClick={() => { setCollectionId(""); setTag(""); }}><span className="sidebar-icon">▤</span>全部文献</button>
        <div className="sidebar-label label-action"><span>合集</span><button title="新建合集" aria-label="新建合集" className="icon-button" onClick={() => { setCollectionParent(collectionId); setModal("collection"); }}>＋</button></div>
        {collections.length ? collections.map((entry) => <button className={`sidebar-entry ${collectionId === entry.id ? "active" : ""}`} key={entry.id} style={{ paddingLeft: 12 + collectionDepth(entry.id, collections) * 12 }} onClick={() => { setCollectionId(entry.id); setTag(""); }}><span className="sidebar-icon">▱</span>{entry.name}</button>) : <p className="sidebar-empty">为研究方向建立合集</p>}
      </div>
      <div className="sidebar-section"><div className="sidebar-label">标签</div><div className="sidebar-tags">{tags.length ? tags.map((entry) => <button key={entry} className={`tag-filter ${tag === entry ? "active" : ""}`} onClick={() => setTag(tag === entry ? "" : entry)}>{entry}</button>) : <p className="sidebar-empty">在文献信息中添加标签</p>}</div></div>
      <div className="local-note"><span className="status-dot" /><strong>本机文献库</strong><p>PDF 与笔记保存在本地。导入不会改写 Zotero 来源。</p></div>
    </aside>
    <main className="library-main">
      <header className="library-header"><div><p className="eyebrow">RETAIN · READ · CONNECT</p><h1>{activeCollection?.name || "科研文献库"}{tag && <span className="heading-tag">#{tag}</span>}</h1><p className="header-caption">把论文、原文证据和自己的思考放在一起。</p></div>
        <div className="header-actions"><button onClick={() => setModal("import")} disabled={busy}>Zotero / JSON 导入</button><button onClick={() => setModal("new-item")} disabled={busy}>新建文献</button><button className="primary" onClick={() => pdfInput.current?.click()} disabled={busy}>{busy ? "处理中…" : "＋ 导入 PDF"}</button></div>
        <input ref={pdfInput} data-testid="pdf-import-input" type="file" accept=".pdf,application/pdf" multiple hidden onChange={(e) => void upload(e.target.files)} />
      </header>
      {notice && <div className={`notice global-notice ${notice.error ? "error" : "success"}`} role={notice.error ? "alert" : "status"}><span>{notice.message}</span><button className="icon-button" onClick={() => setNotice(null)} aria-label="关闭提示">×</button></div>}
      <div className="library-content"><section className="paper-list-panel">
        <div className="search-box"><span>⌕</span><input aria-label="搜索文献" placeholder="搜索标题、作者、DOI" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button className="icon-button" aria-label="清除搜索" onClick={() => setQuery("")}>×</button>}</div>
        <div className="list-summary"><span>{listLoading ? "正在读取…" : `${visibleItems.length} 篇文献`}</span>{(collectionId || tag || query) && <button className="text-button" onClick={() => { setCollectionId(""); setTag(""); setQuery(""); setSearch(""); }}>清除筛选</button>}</div>
        <div className="paper-list" data-testid="paper-list">{visibleItems.map((entry) => <button key={entry.id} className={`paper-card ${selectedId === entry.id ? "selected" : ""}`} disabled={busy} onClick={() => setSelectedId(entry.id)}>
          <span className="paper-kind">{entry.attachments.some((attachment) => attachment.available) ? "PDF" : "文献"}{entry.date && <span>{entry.date.slice(0, 10)}</span>}</span><strong>{entry.title || "未命名文献"}</strong><span className="paper-authors">{entry.authors.slice(0, 2).join(" · ") || "作者待补充"}{entry.authors.length > 2 ? " 等" : ""}</span>
          {entry.tags.length > 0 && <span className="paper-tags">{entry.tags.slice(0, 3).map((value) => <span key={value}>{value}</span>)}</span>}
          <span className="paper-bottom">{entry.attachments.length} 个附件 · {entry.notes.length} 条笔记</span>
        </button>)}{!listLoading && !visibleItems.length && <div className="list-empty"><p>{query || tag || collectionId ? "没有符合筛选条件的文献。" : "文献库还没有论文。"}</p><p className="subtle">{query || tag || collectionId ? "试试其他关键词或清除筛选。" : "导入 PDF 或 Zotero 导出文件，开始第一篇阅读。"}</p></div>}</div>
      </section>
      <section className="paper-workspace" aria-label="文献阅读与详情">
        {detailLoading && !item && <div className="empty-panel"><p>正在读取文献…</p></div>}
        {item && item.id === selectedId ? <><div className="paper-heading"><div><div className="eyebrow">YOUR RESEARCH, WITH EVIDENCE</div><h2>{item.title}</h2><p>{item.authors.join(" · ") || "作者待补充"}{item.date ? ` · ${item.date}` : ""}</p></div><div className="paper-heading-actions"><button onClick={() => attachmentInput.current?.click()} disabled={busy || detailLoading || item.id !== selectedId}>关联 PDF</button><details className="export-menu"><summary>导出 ↗</summary><div><a href={exportUrl(item.id, "markdown")} download>阅读笔记 Markdown</a><a href={exportUrl(item.id, "bibtex")} download>BibTeX 引用</a><a href={exportUrl(item.id, "csljson")} download>CSL JSON</a><a href={exportUrl(item.id, "sourcejson")} download>原始迁移数据 JSON</a></div></details></div>
          <input ref={attachmentInput} data-testid="pdf-attachment-input" hidden type="file" accept=".pdf,application/pdf" onChange={(e) => void upload(e.target.files, true)} />
        </div>
        <MigrationNotice item={item} />
        <nav className="workspace-tabs" aria-label="文献功能"><button className={tab === "reader" ? "active" : ""} onClick={() => setTab("reader")}>阅读与笔记</button><button className={tab === "metadata" ? "active" : ""} onClick={() => setTab("metadata")}>文献信息</button><button className={tab === "evidence" ? "active" : ""} onClick={() => setTab("evidence")}>原文证据</button></nav>
        <div hidden={tab !== "reader"} className="reader-tab"><PdfReader key={item.id} item={item} jump={jump} onSaved={reloadSelected} notify={notify} /></div>
        <div hidden={tab !== "metadata"} className="metadata-tab"><MetadataForm key={item.id + item.updated_at} initial={itemInput(item)} collections={collections} onSave={(value) => void saveItem(value)} busy={busy || detailLoading} /></div>
        <div hidden={tab !== "evidence"} className="evidence-tab">
          <div className="section-heading"><h3>回到论文原文，核对依据</h3><span className="badge">原文检索</span></div><p className="subtle">首版按已解析文本检索摘录。引用保留 PDF 哈希、解析版本和页码；点击可回到原页。检索命中不等于对结论的验证。</p>
          <form className="evidence-search" onSubmit={(event) => void searchEvidence(event)}><label className="field">关键词或短语<input aria-label="原文证据关键词" required value={evidenceQuery} onChange={(e) => setEvidenceQuery(e.target.value)} placeholder="例如：sample size、误差、实验结果" maxLength={1000} /></label><button className="primary" disabled={evidenceBusy || !evidenceQuery.trim()}>{evidenceBusy ? "检索中…" : "检索原文证据"}</button></form>
          {evidence && <div data-testid="evidence-results"><p className="result-heading">{evidence.citations.length ? `找到 ${evidence.citations.length} 条原文摘录` : "没有找到可引用的摘录"}</p><p className="subtle">{evidence.answer}</p>{!evidence.citations.length && <p className="notice warning">可换用原文中的关键词。扫描 PDF 若未 OCR，不会自动获得可检索文字。</p>}{evidence.citations.map((citation, index) =>
            <article className="evidence-card" key={`${citation.ref}:${index}`}><div className="section-heading"><span className="evidence-ref">{citation.ref}</span><button className="text-button" onClick={() => openCitation(citation.attachment_id, citation.page_idx)}>第 {citation.page_label || citation.page_idx + 1} 页 ↗</button></div><blockquote>{citation.quote}</blockquote><details><summary>引用定位信息</summary><dl><dt>PDF SHA-256</dt><dd>{citation.sha256}</dd><dt>解析版本</dt><dd>{citation.revision_id}</dd><dt>原文块</dt><dd>{citation.block_id}</dd><dt>PDF 页序</dt><dd>{citation.page_idx + 1}</dd></dl></details></article>)}</div>}
          <div className="ai-status"><div className="section-heading"><h3>AI 辅助阅读</h3><span className="badge muted">{ai?.model_verified ? "接口状态已报告" : "真实模型未验证"}</span></div><p>{ai?.message || "正在检查本地接口状态…"}</p><p className="subtle">本入口的原文检索不会调用收费模型或向外部上传论文。带证据的真实 AI 问答仍需单独验证。</p></div>
        </div></> : !detailLoading && <div className="welcome-panel"><div className="welcome-mark">r<span>p</span></div><p className="eyebrow">A QUIETER PLACE TO THINK</p><h2>从一篇论文开始。</h2><p>导入文献，保留原文摘录与双语笔记。每次回看，都能找到思考的来处。</p><div className="welcome-actions"><button className="primary" onClick={() => pdfInput.current?.click()}>导入第一篇 PDF</button><button onClick={() => setModal("import")}>从 Zotero 迁移</button></div><div className="welcome-steps"><span><b>01</b> 整理文献</span><span><b>02</b> 阅读与批注</span><span><b>03</b> 核对原文依据</span></div></div>}
      </section></div>
    </main>
    {modal === "import" && <ImportDialog onClose={() => setModal(null)} onImported={imported} />}
    {modal === "new-item" && <Dialog title="新建文献" onClose={() => { if (!busy) setModal(null); }} wide><MetadataForm initial={{ ...EMPTY_ITEM, collection_ids: collectionId ? [collectionId] : [] }} collections={collections} busy={busy} buttonText="创建文献" onSave={(value) => void saveItem(value, true)} /></Dialog>}
    {modal === "collection" && <Dialog title="新建合集" onClose={() => { if (!busy) setModal(null); }}><form onSubmit={(e) => { e.preventDefault(); void createCollection(); }}><label className="field">合集名称<input autoFocus required maxLength={240} value={collectionName} onChange={(e) => setCollectionName(e.target.value)} placeholder="例如：论文选题 / 方法与工具" /></label><label className="field">上级合集<select value={collectionParent} onChange={(e) => setCollectionParent(e.target.value)}><option value="">无（顶层合集）</option>{collections.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><button className="primary" disabled={busy || !collectionName.trim()}>{busy ? "创建中…" : "创建合集"}</button></form></Dialog>}
  </div>;
}
function collectionDepth(id: string, collections: Collection[]): number {
  let depth = 0; let current = collections.find((entry) => entry.id === id); const visited = new Set([id]);
  while (current?.parent_id && depth < 4 && !visited.has(current.parent_id)) { visited.add(current.parent_id); depth++; current = collections.find((entry) => entry.id === current!.parent_id); }
  return depth;
}
function MigrationNotice({ item }: { item: PaperItem }) {
  const detail = item as PaperItem & { migration_warnings?: unknown[]; imported_attachment_declarations?: unknown[] };
  const warnings = detail.migration_warnings || [];
  const declarations = detail.imported_attachment_declarations || [];
  if (!warnings.length && !declarations.length) return null;
  return <details className="migration-notice"><summary>迁移信息：{declarations.length ? `${declarations.length} 项附件来源记录` : ""}{warnings.length ? ` · ${warnings.length} 条提示` : ""}</summary>
    {declarations.length > 0 && <><p>来源附件声明已保留，首版不会自动读取来源路径。请核对缺失文件，使用“关联 PDF”添加副本；手工关联不代表已与全部来源记录匹配。</p><ul>{declarations.map((value, index) => {
      const entry = value && typeof value === "object" ? value as Record<string, unknown> : {};
      return <li key={index}>{String(entry.filename || entry.title || entry.source_key || value || "附件记录")}{entry.link_mode ? `（${String(entry.link_mode)}）` : ""}</li>;
    })}</ul></>}
    {warnings.length > 0 && <ul>{warnings.map((value, index) => {
      const entry = value && typeof value === "object" ? value as Record<string, unknown> : {};
      return <li key={index}>{String(entry.message || value || "存在未覆盖的迁移字段")}</li>;
    })}</ul>}
  </details>;
}
