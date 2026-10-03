import { ServiceBanner } from "../shell/ServiceBanner.js";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/ui/wb/Button.js";
import { useWb, useWorkbench } from "../context.js";
import { NewNoteButton } from "./NewNoteButton.js";
import { NoteEditor } from "./NoteEditor.js";
import { NotesList } from "./NotesList.js";

export function NotesView() {
  const wb = useWorkbench();
  const [exporting, setExporting] = useState(false);
  const status = useWb((state) => state.notes.status);
  useEffect(() => { if (status === "idle") void wb.notes.refresh(); }, [status, wb]);
  return <main aria-label="笔记空间" className="flex min-h-0 min-w-0 flex-1 flex-col bg-wb-panel">
    <header className="flex h-[3.25rem] shrink-0 items-center gap-3 border-b border-wb-line-soft px-4"><h1 className="m-0 flex-1 text-[0.9375rem] font-semibold">笔记</h1><NewNoteButton /><Button size="sm" icon={<Download size={14} aria-hidden="true" />} disabled={exporting} onClick={async () => { setExporting(true); await wb.notes.exportAll(); setExporting(false); }}>导出为 Markdown</Button></header><ServiceBanner />
    <div className="flex min-h-0 min-w-0 flex-1"><NotesList /><NoteEditor /></div>
  </main>;
}
