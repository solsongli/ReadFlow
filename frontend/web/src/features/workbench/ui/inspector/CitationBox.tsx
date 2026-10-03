import { Eye } from "lucide-react";
import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import { Button, IconButton } from "@/ui/wb/Button.js";
import { PopoverContent, PopoverRoot, PopoverTrigger } from "@/ui/wb/Menu.js";
import { formatCitation } from "../../domain/citation.js";
import { useWorkbench } from "../context.js";
import { Section } from "./InspectorSections.js";

export function CitationBox({ row }: { row: WorkbenchRow }) {
  const wb = useWorkbench();
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      wb.notify(`已复制${label}`, "success");
    } catch {
      wb.failure(new Error("复制失败：系统剪贴板不可用。"), () => copy(value, label));
    }
  }
  const gbt = formatCitation("gbt7714", row, row.citekey);
  const bibtex = formatCitation("bibtex", row, row.citekey);
  return (
    <Section title="引用" aside={
      <PopoverRoot>
        <PopoverTrigger asChild><IconButton size="xs" label="预览引用"><Eye size={13} aria-hidden="true" /></IconButton></PopoverTrigger>
        <PopoverContent align="end" className="flex w-[360px] max-w-[calc(100vw-24px)] flex-col gap-3 p-4">
          <p className="m-0 text-[0.75rem] leading-relaxed">{gbt}</p>
          <pre className="wb-scroll m-0 max-h-52 whitespace-pre-wrap break-words rounded-lg bg-wb-panel-2 p-3 font-wb-mono text-[0.75rem]">{bibtex}</pre>
          <Button onClick={() => void copy(`\\cite{${row.citekey}}`, "引用命令")}>复制引用命令</Button>
        </PopoverContent>
      </PopoverRoot>
    }>
      <div className="overflow-hidden rounded-xl bg-wb-panel-2">
        <button type="button" onClick={() => void copy(gbt, "参考文献")} className="wb-info-row wb-transition relative flex w-full items-center justify-between gap-2 border-0 bg-transparent px-3.5 py-2.5 text-left text-wb-link hover:bg-wb-hover">
          <span>复制参考文献</span><span className="text-[0.75rem] text-wb-text-3">GB/T 7714</span>
        </button>
        <button type="button" onClick={() => void copy(bibtex, " BibTeX")} className="wb-info-row wb-transition relative flex w-full items-center justify-between gap-2 border-0 bg-transparent px-3.5 py-2.5 text-left text-wb-link hover:bg-wb-hover">
          <span className="shrink-0">复制 BibTeX</span><span className="wb-truncate text-[0.75rem] text-wb-text-3" title={row.citekey}>{row.citekey}</span>
        </button>
      </div>
    </Section>
  );
}
