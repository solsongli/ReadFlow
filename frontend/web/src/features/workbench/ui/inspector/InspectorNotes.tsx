import type { PaperItem } from "@/platform/contracts/research-library.js";
import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import { mailDate } from "../../domain/format.js";
import { noteKind } from "../../domain/notes-format.js";
import { useWorkbench } from "../context.js";

export function InspectorNotes({ row, item }: { row: WorkbenchRow; item: PaperItem | null }) {
  const wb = useWorkbench();
  const notes = [...(item?.notes ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3);
  return <section aria-label="文献笔记" className="flex flex-col gap-2"><h3 className="m-0 text-[12px] font-semibold text-wb-text-3">笔记</h3><div className="overflow-hidden rounded-xl bg-wb-panel-2">
    {notes.map((note) => <button key={note.id} type="button" onClick={() => void wb.notes.open(row, note.id)} className="wb-info-row wb-transition relative flex w-full flex-col gap-1.5 px-3.5 py-3 text-left hover:bg-wb-hover">
      {note.quote ? <span className="line-clamp-2 font-wb-serif text-[13px] leading-relaxed text-wb-text-2">{note.quote}</span> : null}
      {note.body ? <span className="line-clamp-2 whitespace-pre-wrap text-[12px] leading-relaxed">{note.body}</span> : null}
      <span className="text-[11px] text-wb-text-3">{noteKind(note) === "annotation" ? "批注 · " : ""}{mailDate(note.updated_at)}</span>
    </button>)}
    {!notes.length ? <p className="m-0 px-3.5 py-3 text-[12px] text-wb-text-3">{item ? "还没有笔记，写下你的第一个想法。" : "正在读取笔记…"}</p> : null}
    <button type="button" onClick={() => void wb.notes.createFor(row)} className="wb-info-row wb-transition relative block w-full px-3.5 py-2.5 text-left text-[12px] text-wb-link hover:bg-wb-hover">新建笔记</button>
    <button type="button" onClick={() => void wb.notes.open(row)} className="wb-info-row wb-transition relative block w-full px-3.5 py-2.5 text-left text-[12px] text-wb-link hover:bg-wb-hover">查看全部 {row.notes_count} 条</button>
  </div></section>;
}
