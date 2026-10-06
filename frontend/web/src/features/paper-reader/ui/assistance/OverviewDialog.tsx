import { useEffect, useRef, useState } from "react";
import { useOverview } from "@/features/reader-assistance/index.js";
import { OVERVIEW_SECTIONS, overviewMarkdown } from "@/features/reader-assistance/domain.js";
import type { AssistancePorts } from "../../domain/assistance.js";
import { Button } from "@/ui/wb/Button.js";

export function OverviewDialog({
  overview,
  title,
  ports,
  jump,
}: {
  overview: ReturnType<typeof useOverview>;
  title: string;
  ports: AssistancePorts;
  jump: (page: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [remember, setRemember] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => setRemember(false), [overview.pending?.target]);
  const markdown = () => (overview.value ? overviewMarkdown(overview.value, title) : "");
  async function action(work: () => Promise<unknown>, message: string) {
    try {
      await work();
      setNotice(message);
    } catch {
      setNotice("操作未完成，请重试。");
    }
  }
  return (
    <dialog
      role="dialog"
      ref={dialog}
      aria-label="论文速览"
      onCancel={(e) => {
        e.preventDefault();
        overview.close();
      }}
      className="wb-dialog fixed inset-0 m-auto h-fit max-h-[85vh] w-[44rem] max-w-[92vw] overflow-auto rounded-xl border-0 bg-wb-panel p-5 text-wb-text shadow-wb-pop"
    >
      <header className="flex items-center gap-2">
        <h2 className="m-0 flex-1 text-lg font-semibold">论文速览</h2>
        <Button size="sm" onClick={overview.close}>
          关闭
        </Button>
      </header>
      <p className="text-sm text-wb-text-3">{title}</p>
      <p className="text-xs leading-relaxed text-wb-text-3">
        AI 导读基于摘要、章节标题、引言首尾、结论、图表题注和结果片段（最多约 8 千字）。请核对原文。
      </p>
      {overview.pending ? (
        <section aria-label="速览发送确认" className="rounded-xl bg-wb-selected p-3 text-sm">
          <p>
            将发送：题名、摘要、章节标题、引言与结论、图表题注、主要结果片段及页码 →{" "}
            {overview.pending.service}
          </p>
          <p className="text-xs text-wb-text-3">不会发送整篇 PDF 或其他文献；服务变化后会重新确认。</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            本文献的速览不再提示
          </label>
          <div className="mt-2 flex gap-2">
            <Button onClick={() => overview.approve(remember)}>发送</Button>
            <Button onClick={overview.cancel}>取消</Button>
          </div>
        </section>
      ) : null}
      {overview.busy ? (
        <p role="status" className="text-sm text-wb-text-3">
          正在准备或生成导读…
          <Button size="sm" onClick={overview.cancel}>
            取消生成
          </Button>
        </p>
      ) : null}
      {overview.value ? (
        <div aria-label="导读结果">
          <p className="text-xs text-wb-text-3">
            已缓存在本文 · {new Date(overview.value.created_at).toLocaleString()}
          </p>
          {OVERVIEW_SECTIONS.map(([key, label]) => (
            <section key={key}>
              <h3 className="mb-2 text-sm font-semibold">{label}</h3>
              <ul className="space-y-2 pl-5 text-sm leading-relaxed">
                {overview.value!.sections[key].map((row, i) => (
                  <li key={i} className={row.trusted ? "" : "text-wb-text-3"}>
                    {row.text}{" "}
                    {row.trusted ? (
                      <button
                        className="rounded bg-wb-fill px-1 text-wb-link"
                        onClick={() => {
                          overview.close();
                          jump(row.page!);
                        }}
                      >
                        (p. {row.page})
                      </button>
                    ) : (
                      <span>（页码待核对）</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
      {overview.error ? (
        <p role="status" className="text-sm text-wb-text-3">
          {overview.error}
          <Button
            size="sm"
            onClick={() => {
              overview.close();
              ports.settings("ai");
            }}
          >
            去设置
          </Button>
        </p>
      ) : null}
      <footer className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={overview.busy || Boolean(overview.pending)}
          onClick={() => void overview.generate()}
        >
          {overview.value ? "重新生成" : "生成导读"}
        </Button>
        {overview.value ? (
          <>
            <Button
              onClick={() =>
                void action(async () => {
                  await ports.note(markdown());
                  overview.close();
                }, "已保存为笔记")
              }
            >
              保存为笔记
            </Button>
            <Button
              onClick={() => void action(() => navigator.clipboard.writeText(markdown()), "已复制 Markdown")}
            >
              复制为 Markdown
            </Button>
          </>
        ) : null}
      </footer>
      {notice ? (
        <p role="status" className="text-xs text-wb-text-3">
          {notice}
        </p>
      ) : null}
    </dialog>
  );
}
