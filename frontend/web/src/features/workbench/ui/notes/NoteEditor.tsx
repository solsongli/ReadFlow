import { useEffect, useRef, useState } from "react";
import { Copy, Eye, Pencil, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/ui/wb/Button.js";
import { WbEmptyState } from "@/ui/wb/EmptyState.js";
import { fullNoteDate } from "../../domain/notes-format.js";
import { useWb, useWorkbench } from "../context.js";
import { NoteQuote } from "./NoteQuote.js";
import { NotePreview } from "./NotePreview.js";

export function NoteEditor() {
  const wb = useWorkbench();
  const draft = useWb((state) => state.notes.draft);
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setPreview(false); setConfirm(false); if (draft?.isNew) input.current?.focus(); }, [draft?.note.id]);
  async function copy() {
    if (!draft) return;
    try { await navigator.clipboard.writeText(draft.body); wb.notify("已复制 Markdown。", "success"); }
    catch { wb.failure(new Error("复制失败，系统剪贴板暂不可用。"), copy); }
  }
  if (!draft) return <WbEmptyState className="min-w-0 flex-1" title="把阅读中的想法留在这里" hint="笔记与批注会和文献保存在一起。" action={<Button onClick={() => void wb.notes.create()}>新建笔记</Button>} />;
  const note = draft.note;
  const status = draft.status === "saving" ? "正在保存…" : draft.status === "error" ? "保存失败" : draft.status === "dirty" ? "等待保存…" : draft.isNew ? "空白草稿，输入后自动保存" : "已保存";
  return <section aria-label="笔记编辑器" className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-wb-line-soft px-6 py-3">
      <div className="min-w-24 flex-1"><button type="button" title={note.item_title} onClick={() => void wb.revealNotePaper(note.item_id)} className="wb-truncate block max-w-full text-left text-[12px] text-wb-text-3 hover:text-wb-link">{note.item_title_translated || note.item_title}</button><time dateTime={note.updated_at} className="mt-1 block text-[11px] text-wb-text-3">{fullNoteDate(note.updated_at)}</time></div>
      <IconButton label="复制为 Markdown" onClick={() => void copy()}><Copy size={15} aria-hidden="true" /></IconButton>
      <IconButton label="删除笔记" disabled={deleting || draft.status === "saving"} onClick={() => setConfirm(!confirm)}><Trash2 size={15} aria-hidden="true" /></IconButton>
      <Button size="sm" icon={preview ? <Pencil size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />} onClick={() => setPreview(!preview)}>{preview ? "编辑" : "预览"}</Button>
    </div>
    {confirm ? <div role="alertdialog" aria-label="确认删除笔记" className="mx-6 mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-wb-panel-2 p-3"><span className="flex-1 text-[12px]">删除这条{note.kind === "annotation" ? "批注及其笔记" : "笔记"}？此操作无法撤销。</span><Button size="sm" disabled={deleting} onClick={() => setConfirm(false)}>取消</Button><Button size="sm" variant="danger" disabled={deleting} onClick={async () => { setDeleting(true); await wb.notes.remove(); setDeleting(false); setConfirm(false); }}>确认删除</Button></div> : null}
    <div className="wb-scroll flex min-h-0 flex-1 flex-col px-7 py-6">
      {note.kind === "annotation" ? <div className="mb-7"><NoteQuote note={note} /><p className="mb-0 mt-3 text-[12px] text-wb-text-3">{note.page_idx != null ? `第 ${note.page_idx + 1} 页 · ` : ""}<button type="button" disabled={!note.attachment_id} className="text-wb-link disabled:text-wb-text-3" onClick={() => void wb.openReader(note.item_id, { attachmentId: note.attachment_id ?? undefined, page: note.page_idx == null ? undefined : note.page_idx + 1 })}>在阅读器中打开</button></p></div> : null}
      {preview ? <NotePreview body={draft.body} /> : <textarea ref={input} aria-label="笔记正文" placeholder="记录你的想法…" maxLength={100000} value={draft.body} disabled={deleting} onChange={(event) => wb.notes.edit(event.target.value)} className="min-h-64 w-full flex-1 resize-none border-0 bg-transparent p-0 font-wb-sans text-[17px] leading-[1.75] text-wb-text outline-none placeholder:text-wb-text-3" />}
    </div>
    <div className="flex shrink-0 items-center gap-2 px-7 pb-4 text-[11.5px] text-wb-text-3"><span role="status" title={draft.error || undefined}>{status}</span>{draft.status === "error" ? <button type="button" className="text-wb-link" onClick={() => void wb.notes.flush()}>重试</button> : null}<span className="ml-auto">{draft.body.length.toLocaleString()} / 100,000</span></div>
  </section>;
}
