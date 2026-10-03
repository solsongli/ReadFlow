import { forwardRef, type ButtonHTMLAttributes, type ComponentType } from "react";
import { BookOpenText, FileUp, Languages, MessageSquare, NotebookPen, ScanText } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { ImportMenu } from "../import/ImportMenu.js";
import { useWb, useWorkbench } from "../context.js";
import { OcrLauncher } from "./OcrLauncher.js";
import { PaperLauncher } from "./PaperLauncher.js";

const QuickCard = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  name: string; description: string; tone: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}>(function QuickCard({ name, description, tone, icon: Icon, className, ...props }, ref) {
  return (
    <button ref={ref} type="button" aria-label={name} className={cn("wb-transition flex h-full w-full min-w-0 flex-col gap-2.5 rounded-[14px] border-0 bg-wb-desk-card p-3.5 text-left shadow-wb-card hover:bg-wb-desk-inset disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}>
      <span aria-hidden="true" className={cn("inline-flex h-[1.875rem] w-[30px] shrink-0 items-center justify-center rounded-lg text-wb-on-tool", tone)}><Icon size={17} strokeWidth={1.8} /></span>
      <span className="flex min-w-0 flex-col gap-1"><span className="text-[0.875rem] font-semibold tracking-[-0.01em]">{name}</span><span className="text-[0.75rem] leading-[1.4] text-wb-text-3">{description}</span></span>
    </button>
  );
});

export function QuickStart() {
  const wb = useWorkbench();
  const total = useWb((state) => state.desk.data?.total ?? state.list.result?.counts.all ?? 0);
  return (
    <section aria-label="快速开始" className="grid grid-cols-2 gap-3 @min-[550px]:grid-cols-3 @min-[820px]:grid-cols-6">
      <PaperLauncher kind="translate"><QuickCard name="翻译 PDF" description="选择文献，开始全文翻译" icon={Languages} tone="bg-wb-tool-translate" /></PaperLauncher>
      <PaperLauncher kind="ai"><QuickCard name="AI 伴读" description="围绕当前论文提问" icon={MessageSquare} tone="bg-wb-tool-ai" disabled={!total} /></PaperLauncher>
      <ImportMenu><QuickCard name="导入文献" description="PDF、Zotero / CSL JSON 与 Connector" icon={FileUp} tone="bg-wb-tool-import" /></ImportMenu>
      <OcrLauncher><QuickCard name="本地 OCR" description="识别扫描版 PDF 中的文字" icon={ScanText} tone="bg-wb-tool-ocr" /></OcrLauncher>
      <QuickCard name="笔记" description="集中查看论文的笔记与批注" icon={NotebookPen} tone="bg-wb-tool-notes" onClick={() => void wb.notes.open()} />
      <QuickCard onClick={() => wb.openSettings("glossaries")} name="术语表" description="管理翻译时使用的术语偏好" icon={BookOpenText} tone="bg-wb-tool-glossary" />
    </section>
  );
}
