import type { WorkbenchNote } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { noteColor } from "../../domain/notes-format.js";

const COLORS: Record<string, string> = { yellow: "text-wb-hl-yellow", orange: "text-wb-tag-1", red: "text-wb-hl-red", pink: "text-[var(--wb-note-pink)]", purple: "text-wb-hl-purple", blue: "text-wb-hl-blue", green: "text-wb-hl-green", teal: "text-wb-tag-2", gray: "text-wb-tag-7" };
export function NoteDot({ color }: { color: string }) {
  return <span aria-hidden="true" className={cn("inline-flex shrink-0", COLORS[noteColor(color)])}><span className="h-2 w-2 rounded-full bg-current" /></span>;
}
export function NoteQuote({ note, compact = false }: { note: Pick<WorkbenchNote, "color" | "quote" | "translated_quote">; compact?: boolean }) {
  return <blockquote className={cn("m-0 border-l-[3px] border-current pl-4", COLORS[noteColor(note.color)])}>
    {note.quote ? <p className={cn("m-0 whitespace-pre-wrap break-words font-wb-serif text-[1rem] leading-[1.65] text-wb-text-2", compact && "line-clamp-2 text-[0.8125rem]")}>{note.quote}</p> : null}
    {note.translated_quote ? <p className={cn("mb-0 mt-2 whitespace-pre-wrap break-words font-wb-serif text-[0.875rem] leading-relaxed text-wb-text-3", compact && "line-clamp-2")}>{note.translated_quote}</p> : null}
    {!note.quote && !note.translated_quote ? <p className="m-0 text-[0.8125rem] text-wb-text-3">PDF 选区批注</p> : null}
  </blockquote>;
}
