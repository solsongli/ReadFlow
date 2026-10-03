import { useState } from "react";
import { FileUp, FolderInput, Languages } from "lucide-react";
import { ImportMenu } from "../import/ImportMenu.js";
import { openPdfPicker } from "../import/pdf-picker.js";
import { useWorkbench } from "../context.js";

const CARD = "wb-transition flex min-h-[8.625rem] w-full flex-col items-center justify-center gap-3 rounded-xl bg-wb-panel-2 px-5 py-6 text-[0.8125rem] font-medium hover:bg-wb-hover";
export function WelcomeView() {
  const wb = useWorkbench();
  const [logo, setLogo] = useState(true);
  return <section aria-label="欢迎使用 ReadFlow" className="wb-scroll flex min-h-0 flex-1 items-center justify-center p-7"><div className="flex w-full max-w-[760px] flex-col items-center gap-4 py-8 text-center">
    {logo ? <img src="./src/assets/readflow-logo.svg" alt="ReadFlow" className="mb-2 h-20 w-20" onError={() => setLogo(false)} /> : <span className="text-[1.75rem] font-bold tracking-[-0.02em]">ReadFlow</span>}
    <h1 className="m-0 text-[1.75rem] font-bold tracking-[-0.025em]">欢迎使用 ReadFlow</h1><p className="m-0 text-[0.875rem] leading-relaxed text-wb-text-3">面向科研的文献管理、双语阅读与笔记工具</p>
    <div className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-3"><button type="button" className={CARD} onClick={openPdfPicker}><FileUp size={25} strokeWidth={1.5} aria-hidden="true" />导入 PDF…</button><ImportMenu directJson><button type="button" className={CARD}><FolderInput size={25} strokeWidth={1.5} aria-hidden="true" />从 Zotero / CSL JSON 导入…</button></ImportMenu><button type="button" className={CARD} onClick={() => wb.openSettings("translation")}><Languages size={25} strokeWidth={1.5} aria-hidden="true" />设置翻译服务</button></div>
    <p className="mt-3 text-[0.75rem] text-wb-text-3">也可以把 PDF 拖进窗口。</p>
  </div></section>;
}
