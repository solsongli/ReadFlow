import { useMemo, useState } from "react";
import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import { Button } from "@/ui/wb/Button.js";
import { Segmented } from "@/ui/wb/Segmented.js";
import { formatCitation, type CitationFormat } from "../../domain/citation.js";
import { useWorkbench } from "../context.js";

export function CitationBox({ row }: { row: WorkbenchRow }) {
  const wb = useWorkbench();
  const [format, setFormat] = useState<CitationFormat>("gbt7714");
  const text = useMemo(() => formatCitation(format, row, row.citekey), [format, row]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      wb.notify(`已复制${label}`, "success");
    } catch {
      wb.notify("复制失败：系统剪贴板不可用。", "error");
    }
  }

  return (
    <section aria-label="参考文献格式" className="border-t border-wb-line-soft px-4 pb-3">
      <div className="flex h-8 items-center justify-between">
        <h3 className="m-0 text-[11.5px] font-semibold text-wb-text-3">参考文献格式</h3>
        <Segmented<CitationFormat>
          label="引用格式"
          value={format}
          onChange={setFormat}
          options={[{ value: "gbt7714", label: "GB/T 7714" }, { value: "bibtex", label: "BibTeX" }]}
        />
      </div>
      <pre className="wb-scroll m-0 max-h-40 whitespace-pre-wrap break-words rounded-md border border-wb-line bg-wb-panel-3 p-2.5 font-wb-sans text-[12px] leading-relaxed text-wb-text">
        {format === "bibtex" ? <code className="font-wb-mono text-[11.5px]">{text}</code> : text}
      </pre>
      <div className="mt-2 flex gap-1.5">
        <Button size="sm" onClick={() => void copy(text, format === "bibtex" ? " BibTeX" : "参考文献")}>复制</Button>
        <Button size="sm" variant="ghost" onClick={() => void copy(`\\cite{${row.citekey}}`, "引用命令")}>
          复制 <span className="font-wb-mono">\cite{"{"}…{"}"}</span>
        </Button>
      </div>
    </section>
  );
}
