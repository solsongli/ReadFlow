import { useState } from "react";
import type { ResearchLibraryApi } from "@/platform/api/research-library.js";
import type { Attachment, PaperItem } from "@/platform/contracts/research-library.js";
import { Button } from "@/ui/Button.js";
import { ResearchAgentPanel } from "./ResearchAgentPanel.js";
import { ResearchOcrPanel } from "./ResearchOcrPanel.js";
export function ResearchWorkspace({ api, items, onOpenReader }: { api: ResearchLibraryApi; items: PaperItem[]; onOpenReader: (item: PaperItem, attachment: Attachment, pageIdx?: number) => Promise<void> }) {
  const [tab, setTab] = useState<"agent" | "ocr">("agent");
  return <div className="research-workspace"><p className="research-muted">仅针对已选文献库文献（{items.length} 篇）：{items.map((item) => item.title || "未命名文献").join("、")}</p><div className="research-actions" role="group" aria-label="工作区功能"><Button variant={tab === "agent" ? "default" : "outline"} aria-pressed={tab === "agent"} onClick={() => setTab("agent")}>原文检索 / Agent</Button><Button variant={tab === "ocr" ? "default" : "outline"} aria-pressed={tab === "ocr"} onClick={() => setTab("ocr")}>可选 OCR</Button></div><div hidden={tab !== "agent"}><ResearchAgentPanel api={api} items={items} onOpenReader={onOpenReader} /></div><div hidden={tab !== "ocr"}><ResearchOcrPanel api={api} items={items} /></div></div>;
}
