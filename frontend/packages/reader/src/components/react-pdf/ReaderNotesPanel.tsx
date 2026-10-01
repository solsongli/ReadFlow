// 批注悬浮窗：列表 / 笔记 / 删除 / 导出 / 定位

import { useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import type { ReaderNote } from "../../annotations/types.js";
import { ReaderFloatShell } from "./ReaderFloatShell.js";

export type ReaderNotesPanelProps = {
  open: boolean;
  groups: Array<{ page: number; items: ReaderNote[] }>;
  count: number;
  onClose: () => void;
  onJump: (note: ReaderNote) => void;
  onUpdateNote: (id: string, note: string) => void | Promise<boolean>;
  onRemove: (id: string) => void;
  onExport: () => Promise<boolean>;
  loading?: boolean;
  saving?: boolean;
  error?: string | null;
  storageMode?: "local" | "server";
  onRetry?: () => void;
};

function NoteItem({
  note,
  onJump,
  onUpdateNote,
  onRemove,
  disabled,
}: {
  note: ReaderNote;
  onJump: (note: ReaderNote) => void;
  onUpdateNote: (id: string, note: string) => void | Promise<boolean>;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.note);

  useEffect(() => {
    if (!editing) {
      setDraft(note.note);
    }
  }, [note.note, editing]);

  return (
    <article className="reader-notes-item">
      <div className="reader-notes-item-top">
        <span className="reader-notes-kind">
          {note.pane === "translated" ? "译文" : "原文"}
        </span>
        <div className="reader-notes-item-actions">
          <button type="button" className="reader-notes-link" onClick={() => onJump(note)}>
            定位
          </button>
          <button type="button" className="reader-notes-danger" disabled={disabled} onClick={() => onRemove(note.id)}>
            删除
          </button>
        </div>
      </div>
      <p className="reader-notes-quote">{note.quote}</p>
      {note.translatedQuote ? <p className="reader-notes-note">译文：{note.translatedQuote}</p> : null}
      {editing ? (
        <div className="reader-notes-editor">
          <textarea
            className="reader-notes-textarea"
            value={draft}
            placeholder="写点想法…"
            rows={3}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="reader-notes-editor-actions">
            <button
              type="button"
              className="reader-notes-primary"
              disabled={disabled}
              onClick={async () => {
                const saved = await onUpdateNote(note.id, draft);
                if (saved !== false) setEditing(false);
              }}
            >
              保存
            </button>
            <button type="button" className="reader-notes-link" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        </div>
      ) : note.note ? (
        <button
          type="button"
          className="reader-notes-note"
          disabled={disabled}
          onClick={() => setEditing(true)}
          title="点击编辑"
        >
          {note.note}
        </button>
      ) : (
        <button type="button" className="reader-notes-add-note" disabled={disabled} onClick={() => setEditing(true)}>
          添加笔记
        </button>
      )}
    </article>
  );
}

export function ReaderNotesPanel({
  open,
  groups,
  count,
  onClose,
  onJump,
  onUpdateNote,
  onRemove,
  onExport,
  loading = false, saving = false, error = null, storageMode = "local", onRetry,
}: ReaderNotesPanelProps) {
  const [copied, setCopied] = useState(false);

  return (
    <ReaderFloatShell
      id="reader-notes-panel"
      open={open}
      title="批注"
      subtitle={storageMode === "server" ? "选中 PDF 文字后可添加 · 保存到文献库" : "选中 PDF 文字后可添加 · 本地保存"}
      titleIcon={<StickyNote size={14} strokeWidth={2.25} aria-hidden />}
      storageKey="retainpdf.reader.notes-float.pos.v1"
      ariaLabel="批注"
      onClose={onClose}
      toolbar={(
        <>
          <span className="reader-notes-count">{count} 条</span>
          <button
            type="button"
            className="reader-notes-export"
            disabled={copied || count === 0}
            onClick={async () => {
              const ok = await onExport();
              if (ok) {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              }
            }}
          >
            {copied ? "已复制" : "导出 Markdown"}
          </button>
        </>
      )}
    >
      {loading ? <p role="status" className="reader-notes-empty">正在载入批注…</p> : null}
      {saving ? <p role="status" className="reader-notes-empty">正在保存批注…</p> : null}
      {error ? <div role="alert" className="reader-notes-empty"><p>{error}</p>{onRetry ? <button type="button" className="reader-notes-link" disabled={saving} onClick={onRetry}>重新载入</button> : null}</div> : null}
      {count === 0 ? (
        <p className="reader-notes-empty">
          暂无批注。在 PDF 上拖选文字，点「添加批注」。
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.page} className="reader-notes-group">
            <h3 className="reader-notes-group-title">第 {group.page} 页</h3>
            {group.items.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                onJump={onJump}
                onUpdateNote={onUpdateNote}
                onRemove={onRemove}
                disabled={saving || loading}
              />
            ))}
          </section>
        ))
      )}
    </ReaderFloatShell>
  );
}
