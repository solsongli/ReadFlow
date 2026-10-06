import { useEffect, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import type { AssistancePorts, ReaderContext } from "../../domain/assistance.js";
import type { useReaderChat } from "../../state/assistance/useChat.js";
import { Answer } from "./Answer.js";
export function ChatPanel({
  overview,
  chat,
  ports,
  context,
  quote,
  pages,
  jump,
}: {
  overview: () => void;
  chat: ReturnType<typeof useReaderChat>;
  ports: AssistancePorts;
  context: () => ReaderContext;
  quote: { text: string; key: number };
  pages: number;
  jump: (page: number) => void;
}) {
  const [question, setQuestion] = useState("");
  useEffect(() => {
    if (chat.sent) setQuestion((draft) => (draft === chat.sent?.question ? "" : draft));
  }, [chat.sent]);
  const [selection, setSelection] = useState("");
  const [remember, setRemember] = useState(false);
  useEffect(() => setRemember(false), [chat.pending?.target]);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    void chat.load();
  }, []);
  useEffect(() => {
    setSelection(quote.text);
    if (quote.text) {
      setQuestion("请解释这段文字。");
    }
  }, [quote.key]);
  return (
    <section aria-label="AI 伴读对话" className="flex h-full min-h-0 flex-col p-3">
      <Button size="sm" className="mb-2 self-start" onClick={overview}>
        论文速览
      </Button>
      <header className="flex items-center gap-2 text-[0.75rem] text-wb-text-3">
        <span className="min-w-0 flex-1 truncate">
          {chat.status ? `${chat.status.service} · ${chat.status.model}` : "AI 伴读"}
        </span>
        <Button size="sm" disabled={chat.busy} onClick={() => setClearConfirm(true)}>
          清空会话
        </Button>
      </header>
      {clearConfirm ? (
        <div className="my-2 rounded-lg bg-wb-fill p-2 text-[0.75rem]">
          清空本文献的会话及发送确认偏好？
          <Button size="sm" onClick={() => setClearConfirm(false)}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => {
              void chat.clear();
              setClearConfirm(false);
            }}
          >
            确认清空
          </Button>
        </div>
      ) : null}
      <div className="wb-scroll min-h-0 flex-1 space-y-3 py-3" aria-live="polite">
        {!chat.messages.length && !chat.answer ? (
          <p className="text-[0.8125rem] text-wb-text-3">围绕这篇文献提问，或从原文选取一个片段。</p>
        ) : null}
        {chat.messages.map((message) => (
          <article key={message.id} className="rounded-xl bg-wb-panel-2 p-3">
            <span className="text-[0.6875rem] text-wb-text-3">{message.role === "user" ? "你" : "AI"}</span>
            <Answer text={message.body} pages={pages} jump={jump} />
            {message.role === "assistant" ? (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  onClick={() =>
                    void ports.note(message.body).catch(() => setActionError("笔记未能保存，请重试。"))
                  }
                >
                  保存为笔记
                </Button>
                <Button size="sm" onClick={() => ports.canvas(message.body)}>
                  加入画布
                </Button>
              </div>
            ) : null}
          </article>
        ))}
        {chat.answer ? (
          <article aria-label="正在生成的回答" className="rounded-xl bg-wb-panel-2 p-3">
            <Answer text={chat.answer} pages={pages} jump={jump} />
          </article>
        ) : null}
        {chat.error ? (
          <div role="status" className="text-[0.75rem] leading-relaxed text-wb-text-3">
            {chat.error.message}
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => void chat.load()}>
                重试
              </Button>
              <Button size="sm" onClick={() => ports.settings("ai")}>
                去设置
              </Button>
            </div>
          </div>
        ) : null}
        {actionError ? (
          <p role="status" className="text-[0.75rem] text-wb-text-3">
            {actionError}
          </p>
        ) : null}
      </div>
      {selection ? (
        <div className="mb-2 rounded-lg bg-wb-fill p-2 text-[0.75rem]">
          <blockquote className="m-0 line-clamp-3 font-wb-serif" title={selection}>
            {selection}
          </blockquote>
          <Button size="sm" onClick={() => setSelection("")}>
            移除引用
          </Button>
        </div>
      ) : null}
      {chat.pending ? (
        <div
          role="region"
          aria-label="发送隐私确认"
          className="mb-2 rounded-xl bg-wb-selected p-3 text-[0.75rem]"
        >
          <p className="mt-0">将发送：选中段落、本页文字、题名与摘要 → {chat.status?.service}</p>
          <p className="text-wb-text-3">同时携带本对话最近的问答；仅发送本次确认的文本，不执行文献操作。</p>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" onClick={() => chat.approve(remember)}>
              发送
            </Button>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              本文献不再提示
            </label>
            <Button size="sm" onClick={chat.cancel}>
              取消
            </Button>
          </div>
        </div>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void chat.send(question, { ...context(), selection });
        }}
      >
        <textarea
          aria-label="向 AI 提问"
          maxLength={4000}
          rows={3}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="输入关于本文的问题…"
          className="w-full resize-y rounded-xl border-0 bg-wb-fill p-3 text-[0.8125rem]"
        />
        <div className="mt-2 flex justify-end gap-2">
          {chat.busy ? (
            <Button size="sm" onClick={chat.cancel}>
              停止生成
            </Button>
          ) : (
            <Button size="sm" type="submit" disabled={!question.trim()}>
              提问
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
