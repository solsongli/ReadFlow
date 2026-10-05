import { useState, useEffect, type ReactNode } from "react";
import type { PaperMetadata, Reference } from "../domain/types.js";
export function InformationPanel({
  metadata,
  seconds,
  page,
  references,
  jump,
  panels,
  hidden,
  panelRequest,
}: {
  hidden?: boolean;
  panelRequest?: number;
  panels?: Partial<Record<"批注" | "画布" | "AI" | "译文", ReactNode>>;
  metadata: PaperMetadata;
  seconds: number;
  page: number;
  references: Reference[];
  jump: (page: number, y: number) => void;
}) {
  const [tab, setTab] = useState("信息"),
    [query, setQuery] = useState("");
  useEffect(() => {
    if (panelRequest) {
      setTab("AI");
    }
  }, [panelRequest]);
  return (
    <aside
      aria-label="论文面板"
      className={`${hidden ? "hidden" : "flex"} w-[22rem] min-w-0 shrink-0 flex-col border-l border-wb-line-soft bg-wb-panel`}
    >
      <div
        role="tablist"
        aria-label="论文面板类别"
        className="flex gap-1 border-b border-wb-line-soft px-2 py-2"
      >
        {["批注", "画布", "AI", "译文", "信息"].map((name) => (
          <button
            role="tab"
            aria-selected={tab === name}
            key={name}
            onClick={() => setTab(name)}
            onDragEnter={(event) => {
              if (name === "画布" && event.dataTransfer.types.includes("application/x-readflow-canvas")) {
                setTab(name);
              }
            }}
            className={`flex-1 rounded-lg border-0 py-1 text-[0.75rem] ${tab === name ? "bg-wb-selected font-semibold" : "bg-transparent text-wb-text-3"}`}
          >
            {name}
          </button>
        ))}
      </div>
      {(["批注", "画布", "AI", "译文"] as const).map((name) => (
        <div key={name} className={tab === name ? "min-h-0 flex-1 overflow-auto" : "hidden"}>
          {panels?.[name] ?? <p className="p-5 text-[0.8125rem] text-wb-text-3">即将推出</p>}
        </div>
      ))}
      <div className={tab === "信息" ? "wb-scroll min-h-0 flex-1 p-4" : "hidden"}>
        <h2 className="m-0 text-[1.0625rem] font-semibold leading-snug" title={metadata.title}>
          {metadata.title}
        </h2>
        <p className="text-[0.75rem] leading-relaxed text-wb-text-3">
          {metadata.authors.join(", ") || "作者未知"}
        </p>
        <dl className="m-0 space-y-3 rounded-xl bg-wb-panel-2 p-3 text-[0.75rem]">
          {[
            ["出处", metadata.venue],
            ["DOI", metadata.doi],
            ["引用键", metadata.citekey],
            ["累计阅读", `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`],
            ["上次读到", `第 ${page} 页`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-wb-text-3">{label}</dt>
              <dd className="m-0 mt-0.5 break-words">{value || "—"}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mb-2 mt-6 text-[0.8125rem] font-semibold">本文参考文献 · {references.length}</h3>
        <input
          aria-label="筛选参考文献"
          placeholder="查找作者、题名…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border-0 bg-wb-fill p-2 text-[0.75rem]"
        />
        {references
          .filter((ref) => ref.text.toLowerCase().includes(query.toLowerCase()))
          .map((ref) => (
            <button
              key={ref.id}
              type="button"
              className="mt-2 w-full rounded-lg border-0 bg-transparent p-2 text-left font-wb-serif text-[0.8125rem] leading-relaxed hover:bg-wb-hover"
              onClick={() => jump(ref.page, ref.y)}
            >
              {ref.number ? `[${ref.number}] ` : ""}
              {ref.text}
            </button>
          ))}
        {!references.length ? (
          <p className="text-[0.75rem] text-wb-text-3">正在索引，或未识别到参考文献章节。</p>
        ) : null}
      </div>
    </aside>
  );
}
