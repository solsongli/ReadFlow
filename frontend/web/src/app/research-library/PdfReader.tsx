import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { api, pdfUrl } from "./api";
import { formatDate, readableError, validateNote } from "./model";
import type { Note, NoteInput, PaperItem } from "./types";
import { Dialog } from "./Dialog";

pdfjs.GlobalWorkerOptions.workerSrc = "/dist/research-library/pdf.worker.min.mjs";
const PDF_OPTIONS = { standardFontDataUrl: "/dist/research-library/standard_fonts/", cMapUrl: "/dist/research-library/cmaps/", cMapPacked: true };
export interface ReaderJump { attachmentId: string; pageIdx: number; serial: number }
export function PdfReader({ item, jump, onSaved, notify }: {
  item: PaperItem; jump: ReaderJump | null; onSaved: () => Promise<void>; notify: (message: string, error?: boolean) => void;
}) {
  const first = item.attachments.find((entry) => entry.available)?.id || item.attachments[0]?.id || "";
  const [attachmentId, setAttachmentId] = useState(first);
  const attachment = item.attachments.find((entry) => entry.id === attachmentId);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [loadedPages, setLoadedPages] = useState(0);
  const total = loadedPages || attachment?.page_count || 0;
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(650);
  const [pdfError, setPdfError] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const selectionRoot = useRef<HTMLDivElement>(null);
  const [quote, setQuote] = useState("");
  const [translated, setTranslated] = useState("");
  const [body, setBody] = useState("");
  const [linked, setLinked] = useState(Boolean(first));
  const [notePage, setNotePage] = useState("1");
  const [noteAttachment, setNoteAttachment] = useState(first);
  const [editing, setEditing] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Note | null>(null);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(280, Math.min(760, element.clientWidth - 40)));
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [attachmentId]);
  useEffect(() => {
    if (!item.attachments.some((entry) => entry.id === attachmentId)) {
      setAttachmentId(first); setPage(1); setNoteAttachment(first); setLinked(Boolean(first));
    }
  }, [item.attachments, attachmentId, first]);
  useEffect(() => { setLoadedPages(0); setPdfError(""); }, [attachmentId]);
  useEffect(() => { setPageInput(String(page)); if (!editing) { setNotePage(String(page)); setNoteAttachment(attachmentId); } }, [page, attachmentId, editing]);
  useEffect(() => {
    if (!jump) return;
    setAttachmentId(jump.attachmentId); setPage(jump.pageIdx + 1);
  }, [jump]);
  function changeAttachment(id: string) { setAttachmentId(id); setPage(1); setLinked(Boolean(id)); }
  function goPage(value: number) {
    if (Number.isFinite(value)) setPage(Math.min(total || value, Math.max(1, Math.trunc(value))));
  }
  function selectQuote() {
    const selection = window.getSelection();
    if (!selection || !selectionRoot.current || !selectionRoot.current.contains(selection.anchorNode) || !selectionRoot.current.contains(selection.focusNode)) return;
    const text = selection.toString().trim();
    if (!text) return;
    setQuote(text.slice(0, 20000)); setLinked(true); setNotePage(String(page)); setNoteAttachment(attachmentId);
  }
  function clearDraft() { setQuote(""); setTranslated(""); setBody(""); setEditing(null); setNotePage(String(page)); setNoteAttachment(attachmentId); setLinked(Boolean(attachmentId)); }
  async function saveNote() {
    const draft: NoteInput = { attachment_id: linked ? noteAttachment || attachmentId || null : null,
      page_idx: linked ? Number(notePage) - 1 : null, quote, translated_quote: translated, body };
    const count = item.attachments.find((entry) => entry.id === draft.attachment_id)?.page_count || (draft.attachment_id === attachmentId ? total : null);
    const invalid = validateNote(draft, count); if (invalid) { notify(invalid, true); return; }
    setBusy(true);
    try {
      if (editing) await api.updateNote(editing.id, draft); else await api.createNote(item.id, draft);
      clearDraft(); await onSaved(); notify(editing ? "笔记修改已保存。" : "笔记已保存到本地文献库。");
    } catch (e) { notify(readableError(e), true); } finally { setBusy(false); }
  }
  function editNote(note: Note) {
    setEditing(note); setQuote(note.quote); setTranslated(note.translated_quote); setBody(note.body);
    setLinked(Boolean(note.attachment_id && note.page_idx !== null)); setNoteAttachment(note.attachment_id || attachmentId);
    setNotePage(note.page_idx === null ? String(page) : String(note.page_idx + 1));
    if (note.attachment_id && note.page_idx !== null) { setAttachmentId(note.attachment_id); setPage(note.page_idx + 1); }
  }
  async function removeNote(note: Note) {
    setBusy(true);
    try { await api.deleteNote(note.id); if (editing?.id === note.id) clearDraft(); await onSaved(); notify("笔记已删除。"); }
    catch (e) { notify(readableError(e), true); } finally { setBusy(false); }
  }
  function jumpNote(note: Note) {
    if (!note.attachment_id || note.page_idx === null) return;
    setAttachmentId(note.attachment_id); setPage(note.page_idx + 1);
  }
  return <>{removeTarget ? <Dialog title="删除这条笔记？" onClose={() => { if (!busy) setRemoveTarget(null); }}>
    <p>此操作会从本地文献库移除笔记。</p><div className="note-actions"><button type="button" disabled={busy} onClick={() => setRemoveTarget(null)}>取消</button><button type="button" className="danger" disabled={busy} onClick={async () => { await removeNote(removeTarget); setRemoveTarget(null); }}>{busy ? "处理中…" : "删除"}</button></div>
  </Dialog> : null}<div className="reading-layout"><section className="pdf-column">
    {item.attachments.length > 0 && <label className="attachment-picker">PDF 附件<select value={attachmentId} onChange={(e) => changeAttachment(e.target.value)}>{item.attachments.map((entry) =>
      <option key={entry.id} value={entry.id}>{entry.filename}{entry.available ? "" : " · 文件缺失"}</option>)}</select></label>}
    {attachment?.available ? <><div className="pdf-toolbar">
      <button aria-label="上一页" onClick={() => goPage(page - 1)} disabled={page <= 1}>←</button>
      <form onSubmit={(e) => { e.preventDefault(); goPage(Number(pageInput)); }}><label>页码 <input aria-label="PDF 页码" inputMode="numeric" value={pageInput} onChange={(e) => setPageInput(e.target.value)} onBlur={() => goPage(Number(pageInput))} /></label><span>/ {total || "…"}</span></form>
      <button aria-label="下一页" onClick={() => goPage(page + 1)} disabled={!total || page >= total}>→</button>
      <span className="toolbar-spacer" /><button aria-label="缩小" onClick={() => setZoom((old) => Math.max(.6, old - .1))} disabled={zoom <= .6}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="放大" onClick={() => setZoom((old) => Math.min(2, old + .1))} disabled={zoom >= 2}>＋</button>
      <a href={pdfUrl(attachment.id)} download={attachment.filename} className="download-link">原 PDF ↗</a>
    </div><div className="pdf-viewport" ref={viewport}>
      <div ref={selectionRoot} onMouseUp={selectQuote} onKeyUp={selectQuote} data-testid="pdf-viewer">
        {pdfError ? <div className="empty-panel"><h3>PDF 暂时无法显示</h3><p>{pdfError}</p><a href={pdfUrl(attachment.id)} target="_blank" rel="noreferrer">在浏览器中打开原 PDF</a></div> :
          <Document file={pdfUrl(attachment.id)} options={PDF_OPTIONS} loading={<p className="pdf-loading">正在加载 PDF…</p>}
            onLoadSuccess={({ numPages }) => { setLoadedPages(numPages); setPage((old) => Math.min(old, numPages)); }}
            onLoadError={(error) => setPdfError(readableError(error))}>
            <Page pageNumber={page} width={width * zoom} renderTextLayer renderAnnotationLayer={false} loading={<p className="pdf-loading">正在渲染第 {page} 页…</p>} onRenderError={(error) => setPdfError(readableError(error))} />
          </Document>}
      </div>
    </div><p className="reader-hint">选择 PDF 中的文字，即可保存原文、译文和页码笔记。{textStatusHint(attachment.text_status)}</p></> :
      <div className="empty-panel"><div className="empty-symbol">▤</div><h3>{attachment ? "附件文件缺失" : "为这篇文献添加 PDF"}</h3><p>{attachment ? "迁移保留了附件记录，但尚未取得文件。使用上方“关联 PDF”添加副本；来源文件保持不变。" : "使用上方“关联 PDF”，即可阅读、选择原文并保存页码笔记。"}</p></div>}
  </section><aside className="notes-column">
    <div className="section-heading"><h3>{editing ? "编辑笔记" : "阅读笔记"}</h3><span className="badge">{item.notes.length}</span></div>
    <form className="note-composer" onSubmit={(e) => { e.preventDefault(); void saveNote(); }}>
      <label className="field">原文摘录<textarea aria-label="原文摘录" rows={3} value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="选择 PDF 文字，或手动填写摘录" maxLength={20000} /></label>
      <label className="field">译文 / 双语对照<textarea aria-label="译文 / 双语对照" rows={2} value={translated} onChange={(e) => setTranslated(e.target.value)} placeholder="你的译文；首版不自动调用模型" maxLength={20000} /></label>
      <label className="field">我的笔记<textarea aria-label="我的笔记" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="理解、问题或后续实验" maxLength={50000} /></label>
      {item.attachments.length > 0 && <div className="note-anchor"><label><input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />关联 PDF 和页码</label>{linked && <label>第 <input aria-label="笔记页码" type="number" min="1" value={notePage} onChange={(e) => setNotePage(e.target.value)} /> 页</label>}</div>}
      <div className="note-actions"><button className="primary" type="submit" disabled={busy}>{busy ? "保存中…" : editing ? "保存修改" : "保存笔记"}</button>{(editing || quote || body || translated) && <button type="button" onClick={clearDraft} disabled={busy}>{editing ? "取消编辑" : "清空草稿"}</button>}</div>
    </form>
    <div className="note-list" data-testid="notes-list">{item.notes.length === 0 ? <p className="subtle">笔记会持久保存，刷新或重新启动后仍可查看。</p> : item.notes.map((note) => <article className="saved-note" key={note.id}>
      <div className="note-meta">{note.page_idx === null ? <span>文献笔记</span> : <button className="text-button" onClick={() => jumpNote(note)}>第 {note.page_idx + 1} 页 ↗</button>}<time>{formatDate(note.updated_at)}</time></div>
      {note.quote && <blockquote>{note.quote}</blockquote>}{note.translated_quote && <p className="translated-quote">{note.translated_quote}</p>}{note.body && <p className="note-body">{note.body}</p>}
      <div className="saved-note-actions"><button className="text-button" disabled={busy} onClick={() => editNote(note)}>编辑</button><button className="text-button danger" disabled={busy} onClick={() => setRemoveTarget(note)}>删除</button></div>
    </article>)}</div>
  </aside></div></>;
}

function textStatusHint(status: string): string {
  switch (status) {
    case "ready": case "native_text": return "已有原文文本索引，可进行证据检索。";
    case "partial_needs_ocr": return "部分页面无法提取文字；证据仅来自已解析页，扫描页仍需 OCR。";
    case "needs_ocr": return "未提取到可检索文字，扫描页需要 OCR；手工笔记仍可保存。";
    case "truncated": return "文本索引达到首版上限，检索可能遗漏后续内容。";
    default: return "原文文本尚未建立索引，首次证据检索时解析；扫描页需要 OCR。";
  }
}
