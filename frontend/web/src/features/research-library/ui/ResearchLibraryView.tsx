import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/ui/Button.js";
import { EmptyState } from "@/ui/icons/EmptyState.js";
import { researchLibraryApi, type ResearchLibraryApi, type ResearchExportFormat } from "@/platform/api/research-library.js";
import type { Attachment, Collection, ConnectorStatus, ImportResult, ItemInput, PaperItem } from "@/platform/contracts/research-library.js";
import { buildResearchReaderUrl } from "../domain/reader-route.js";
import { navigateToReader } from "@/features/reader/index.js";
import { EMPTY_ITEM, itemInput, readableError } from "../domain/model.js";
import { ResearchDialog } from "./ResearchDialog.js";
import { ResearchMetadataForm } from "./ResearchMetadataForm.js";
import { ResearchWorkspace } from "./ResearchWorkspace.js";
import { MigrationWarnings, ResearchImportDialog } from "./ResearchImportDialog.js";

type Modal = "import" | "new" | "collection" | "detail" | "workspace" | null;
type ConnectorState = { state: "loading" | "failed" | "unavailable" } | { state: "ready"; data: ConnectorStatus };
export function ResearchLibraryView({ api = researchLibraryApi }: { api?: ResearchLibraryApi }) {
  const [workspaceSelection, setWorkspaceSelection] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<PaperItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState("");
  const [tag, setTag] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [connector, setConnector] = useState<ConnectorState>({ state: "loading" });
  const [modal, setModal] = useState<Modal>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [item, setItem] = useState<PaperItem | null>(null);
  const selected = useRef(selectedId); selected.current = selectedId;
  const [detailLoading, setDetailLoading] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [parentCollection, setParentCollection] = useState("");
  const pdfInput = useRef<HTMLInputElement>(null);
  const attachInput = useRef<HTMLInputElement>(null);
  useEffect(() => { const timer = window.setTimeout(() => setSearch(query), 250); return () => window.clearTimeout(timer); }, [query]);
  useEffect(() => {
    const load = api.connectorStatus;
    if (!load) { setConnector({ state: "unavailable" }); return; }
    const controller = new AbortController(); setConnector({ state: "loading" });
    Promise.resolve().then(() => load(controller.signal)).then((data) => {
      if (!data || !["experimental", "disabled", "coexist", "unsupported"].includes(data.status)) throw new Error("Unknown Connector status");
      if (!controller.signal.aborted) setConnector({ state: "ready", data });
    }).catch(() => { if (!controller.signal.aborted) setConnector({ state: "failed" }); });
    return () => controller.abort();
  }, [api]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    api.items(search, collection, controller.signal).then((value) => {
      setItems(value.items); setCollections(value.collections); setTags(value.tags);
    }).catch((e) => { if (e.name !== "AbortError") setError(readableError(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, search, collection, revision]);
  useEffect(() => {
    let active = true;
    setItem(null);
    if (!selectedId || modal !== "detail") return;
    setDetailLoading(true);
    api.item(selectedId).then((value) => { if (active) setItem(value); }).catch((e) => { if (active) setError(readableError(e)); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [api, selectedId, modal, revision]);
  const refresh = useCallback((clear = false) => {
    if (clear) { setQuery(""); setSearch(""); setCollection(""); setTag(""); }
    setRevision((old) => old + 1);
  }, []);
  useEffect(() => {
    if (modal !== null || pending) return;
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [modal, pending, refresh]);
  const fail = useCallback((e: unknown) => { const message = readableError(e); setError(message); toast.error(message); }, []);
  function close() { if (!pending) { setModal(null); setSelectedId(null); setItem(null); } }
  function openDetail(value: PaperItem) { setItem(null); setSelectedId(value.id); setModal("detail"); }
  async function save(value: ItemInput, create = false) {
    if (!create && (!item || item.id !== selectedId || detailLoading)) return;
    const target = item?.id; setPending(true); setError("");
    try { await (create ? api.createItem(value) : api.updateItem(target!, value)); refresh(); close(); toast.success(create ? "文献已创建，可关联 PDF。" : "文献信息与分类已保存。"); }
    catch (e) { fail(e); } finally { setPending(false); }
  }
  async function upload(files: FileList | null, associate = false) {
    if (!files?.length) return;
    if (associate && (!item || item.id !== selectedId || detailLoading)) return;
    const target = associate ? item!.id : undefined;
    setPending(true); setError(""); let completed = 0; let bridgeMissing = false;
    try {
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("请选择 PDF 文件。");
        const value = await api.upload(file, target); completed++; bridgeMissing ||= Boolean(value.partial_failure || !value.attachment.reader_ready);
      }
      refresh(!associate); toast.success(`已保存 ${completed} 个 PDF。${bridgeMissing ? "原阅读器连接尚待重验；可在附件处点击连接/重试。" : "可使用原阅读器阅读。"}`);
    } catch (e) { fail(e); if (completed) refresh(); }
    finally { setPending(false); if (pdfInput.current) pdfInput.current.value = ""; if (attachInput.current) attachInput.current.value = ""; }
  }
  async function createCollection() {
    setPending(true); setError("");
    try { await api.createCollection(collectionName.trim(), parentCollection || null); setModal(null); setCollectionName(""); refresh(); toast.success("合集已创建。"); }
    catch (e) { fail(e); } finally { setPending(false); }
  }
  function imported(result: ImportResult) { refresh(true); toast.success(`迁移完成：新增 ${result.created_items} 篇，更新 ${result.updated_items} 篇，保持不变 ${result.unchanged_items} 篇。`); }
  async function openReader(paper: PaperItem, attachment: Attachment, pageIdx?: number) {
    setPending(true); setError("");
    try {
      const checked = await api.nativeReader(attachment.id);
      if (checked.item.id !== paper.id || checked.attachment.item_id !== paper.id || checked.attachment.id !== attachment.id || checked.attachment.sha256 !== attachment.sha256) throw new Error("原阅读器返回的文献/附件身份不匹配，已停止打开。");
      if (!checked.attachment.reader_ready) throw new Error(checked.native_bridge?.message || "原阅读器连接未就绪，PDF 已保留，可重试。");
      const url = buildResearchReaderUrl(paper.id, checked.attachment, pageIdx);
      setModal(null); navigateToReader(url);
    } catch (e) { fail(e); } finally { setPending(false); }
  }
  async function download(format: ResearchExportFormat) {
    if (!item || item.id !== selectedId) return;
    setPending(true);
    try { await api.download(item.id, format, item.title || "research-notes"); }
    catch (e) { fail(e); } finally { setPending(false); }
  }
  const visible = tag ? items.filter((entry) => entry.tags.includes(tag)) : items;
  return <section id="research-library-view" className="library-view research-native-view" aria-label="文献管理">
    <div className="research-native-heading"><div><h2>文献管理</h2><p className="research-muted">整理书目、合集与标签；阅读沿用 RetainPDF 原阅读器。</p></div><div className="research-actions"><Button variant="outline" disabled={pending} onClick={() => setModal("import")}>Zotero / JSON 导入</Button><Button variant="outline" disabled={pending} onClick={() => setModal("new")}>新建文献</Button><Button variant="default" disabled={pending} onClick={() => pdfInput.current?.click()}>{pending ? "处理中…" : "导入 PDF"}</Button></div></div>
    <p className="research-muted" data-testid="native-connector-status" role="status">{connectorDescription(connector)}</p>
    <input hidden ref={pdfInput} data-testid="native-pdf-input" type="file" multiple accept=".pdf,application/pdf" onChange={(e) => void upload(e.target.files)} />
    <div className="research-filter-row"><label className="research-field">搜索文献<input aria-label="搜索文献信息" placeholder="标题、作者或 DOI" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <label className="research-field">合集<select aria-label="按文献合集筛选" value={collection} onChange={(e) => setCollection(e.target.value)}><option value="">全部合集</option>{collections.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <label className="research-field">标签<select aria-label="按文献标签筛选" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">全部标签</option>{tags.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      <Button variant="outline" disabled={pending || loading || modal !== null} onClick={() => refresh()}>刷新</Button>
      <Button variant="outline" disabled={pending} onClick={() => { setParentCollection(collection); setModal("collection"); }}>新建合集</Button>
      {(query || collection || tag) && <Button variant="ghost" onClick={() => refresh(true)}>清除筛选</Button>}
    </div>
    {error && <div className="research-error" role="alert">{error}<Button variant="outline" onClick={() => refresh()}>重试加载</Button></div>}
    <div className="research-actions research-workspace-entry"><Button variant="outline" disabled={!items.some((entry) => workspaceSelection.has(entry.id)) || pending} onClick={() => setModal("workspace")}>文献库工作区（{items.filter((entry) => workspaceSelection.has(entry.id)).length} 篇）</Button><span className="research-muted">选择一篇或多篇，检索原文、Agent 问答或按需 OCR。</span></div>
    <div className="research-list-heading"><span>{loading ? "读取中…" : `${visible.length} 篇文献`}</span><span className="research-muted">未自动迁移已有文献库</span></div>
    <div className="research-native-scroll">{visible.length ? <table className="research-table"><thead><tr><th>标题 / 作者</th><th>日期</th><th>标签</th><th>附件</th><th>操作</th></tr></thead><tbody>{visible.map((entry) => {
      const attachment = entry.attachments.find((value) => value.available);
      return <tr key={entry.id}><td><label className="research-paper-select"><input type="checkbox" aria-label={`选择文献：${entry.title || "未命名文献"}`} checked={workspaceSelection.has(entry.id)} onChange={(e) => setWorkspaceSelection((old) => { const next = new Set(old); if (e.target.checked) next.add(entry.id); else next.delete(entry.id); return next; })} /><span>选择</span></label><button className="research-title-button" disabled={pending} onClick={() => openDetail(entry)}>{entry.title || "未命名文献"}</button><p className="research-muted">{entry.authors.join(" · ") || "作者待补充"}</p></td><td>{entry.date || "—"}</td><td><div className="research-tags">{entry.tags.map((value) => <span key={value}>{value}</span>)}</div></td><td>{entry.attachments.length} 个</td><td><div className="research-actions"><Button variant="outline" disabled={pending} onClick={() => openDetail(entry)}>管理</Button>{attachment && <Button variant="default" disabled={pending} onClick={() => void openReader(entry, attachment)}>原阅读器</Button>}</div></td></tr>;
    })}</tbody></table> : !loading && <EmptyState id="research-library-empty" instrument="flask" title={query || tag || collection ? "没有符合筛选的文献" : "从一篇论文开始"} hint={query || tag || collection ? "更换关键词或清除筛选。" : "导入 PDF，或先预览 Zotero JSON 快照。元数据、附件与来源记录会保存在本地。"}><Button variant="outline" onClick={() => setModal("import")}>从 Zotero JSON 导入</Button></EmptyState>}</div>
    {modal === "workspace" && <ResearchDialog title="文献库工作区" onClose={close} pending={pending} size="workspace"><ResearchWorkspace api={api} items={items.filter((entry) => workspaceSelection.has(entry.id))} onOpenReader={openReader} /></ResearchDialog>}
    {modal === "import" && <ResearchImportDialog api={api} onClose={close} onImported={imported} />}
    {modal === "new" && <ResearchDialog title="新建文献" onClose={close} pending={pending}><ResearchMetadataForm initial={{ ...EMPTY_ITEM, collection_ids: collection ? [collection] : [] }} collections={collections} pending={pending} label="创建文献" onSave={(value) => void save(value, true)} /></ResearchDialog>}
    {modal === "collection" && <ResearchDialog title="新建文献合集" onClose={close} pending={pending} size="standard"><form onSubmit={(e) => { e.preventDefault(); void createCollection(); }}><label className="research-field">合集名称<input autoFocus aria-label="文献合集名称" required maxLength={240} value={collectionName} onChange={(e) => setCollectionName(e.target.value)} /></label><label className="research-field">上级合集<select value={parentCollection} onChange={(e) => setParentCollection(e.target.value)}><option value="">无（顶层合集）</option>{collections.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><Button variant="default" type="submit" disabled={pending || !collectionName.trim()}>创建合集</Button></form></ResearchDialog>}
    {modal === "detail" && <ResearchDialog title="管理文献与附件" onClose={close} pending={pending} size="workspace">{detailLoading || !item || item.id !== selectedId ? <p className="research-muted">正在读取当前文献…</p> : <>
      <ResearchMetadataForm key={item.id + item.updated_at} initial={itemInput(item)} collections={collections} pending={pending} onSave={(value) => void save(value)} />
      <section className="research-detail-section"><div className="research-native-heading"><h3>PDF 附件</h3><Button variant="outline" disabled={pending} onClick={() => attachInput.current?.click()}>关联 PDF</Button></div><input hidden ref={attachInput} data-testid="native-attachment-input" type="file" accept=".pdf,application/pdf" onChange={(e) => void upload(e.target.files, true)} />
        {item.attachments.length ? item.attachments.map((attachment) => <div key={attachment.id} className="research-attachment-row"><div><strong>{attachment.filename}</strong><p className="research-muted">{attachment.page_count || "?"} 页 · {attachment.available ? attachment.reader_ready ? "已接入原阅读器" : "已保存，连接原阅读器待重验" : "来源文件缺失"}</p>{attachment.native_bridge?.message && !attachment.reader_ready && <p className="research-muted">{attachment.native_bridge.message}</p>}</div>{attachment.available && <Button variant="outline" disabled={pending} onClick={() => void openReader(item, attachment)}>{attachment.reader_ready ? "在原阅读器打开" : "连接 / 重试原阅读器"}</Button>}</div>) : <p className="research-muted">书目可先整理；关联 PDF 后即可使用原阅读器。</p>}
      </section>
      <MigrationDetails item={item} />
      {item.notes.length > 0 && <section className="research-detail-section"><h3>已保存的阅读与来源笔记（{item.notes.length}）</h3>{item.notes.map((note) => {
        const attachment = item.attachments.find((entry) => entry.id === note.attachment_id && entry.available);
        return <article className="research-note-preview" key={note.id}>{note.quote && <blockquote>{note.quote}</blockquote>}{note.translated_quote && <p className="research-muted">{note.translated_quote}</p>}{note.body && <p>{note.body}</p>}{attachment && note.page_idx !== null && <Button variant="link" disabled={pending} onClick={() => void openReader(item, attachment, note.page_idx!)}>原文第 {note.page_idx + 1} 页 ↗</Button>}</article>;
      })}</section>}
      <section className="research-detail-section"><h3>导出</h3><div className="research-actions">{([["markdown", "阅读笔记 Markdown"], ["bibtex", "BibTeX 引用"], ["csljson", "CSL JSON"], ["sourcejson", "原始迁移数据 JSON"]] as const).map(([format, text]) => <Button variant="outline" key={format} disabled={pending} onClick={() => void download(format)}>{text}</Button>)}</div></section>
    </>}</ResearchDialog>}
  </section>;
}
function MigrationDetails({ item }: { item: PaperItem }) {
  const value = item as PaperItem & { migration_warnings?: Array<{ code: string; message: string }>; imported_attachment_declarations?: Array<Record<string, unknown>> };
  const declarations = value.imported_attachment_declarations || [];
  const warnings = value.migration_warnings || [];
  if (!declarations.length && !warnings.length) return null;
  return <section className="research-detail-section"><h3>迁移缺口与来源记录</h3>{declarations.length > 0 && <details className="research-warnings" open><summary>来源附件声明（{declarations.length}）</summary><p>首版不会自动读取来源文件路径。缺失文件请用“关联 PDF”添加副本；手工关联不表示全部来源记录均已匹配。</p><ul>{declarations.map((entry, index) => <li key={index}>{String(entry.filename || entry.title || entry.source_key || "来源附件")} · {String(entry.link_mode || "")}</li>)}</ul></details>}<MigrationWarnings warnings={warnings} /></section>;
}

function connectorDescription(value: ConnectorState): string {
  if (value.state === "loading") return "浏览器抓取：正在读取状态…";
  if (value.state === "failed") return "浏览器抓取：状态读取失败，文献管理仍可使用。";
  if (value.state === "unavailable") return "浏览器抓取：当前服务未提供状态，文献管理仍可使用。";
  if (!("data" in value)) return "浏览器抓取：状态读取失败，文献管理仍可使用。";
  const port = Number.isInteger(value.data.port) && value.data.port! > 0 && value.data.port! <= 65535 ? String(value.data.port) : "未知";
  switch (value.data.status) {
    case "experimental": {
      const check = value.data.partial_acceptance;
      const publicSample = check?.public_samples?.some((sample) => sample.site === "arxiv.org" && sample.identifier === "2503.03480" && sample.revision === "v4");
      return check?.fixture === "synthetic_local_webpage_pdf"
        ? `浏览器抓取：实验性接收已启用（端口 ${port}）；${check.browser} / Connector ${check.connector_version} 的${publicSample ? "合成网页及 arXiv 2503.03480v4" : "合成网页"} PDF 保存已实测，其他站点仍待验证。`
        : `浏览器抓取：实验性接收已启用（端口 ${port}）；官方扩展尚待实测。`;
    }
    case "disabled": return "浏览器抓取：接收服务未启用，可用 Zotero JSON 导入。";
    case "coexist": return `浏览器抓取：端口 ${port} 已有服务，RetainPDF 未抢占；可继续使用已有服务或 JSON 导入。`;
    case "unsupported": return "浏览器抓取：当前环境暂不支持接收服务，可用 Zotero JSON 导入。";
  }
}
