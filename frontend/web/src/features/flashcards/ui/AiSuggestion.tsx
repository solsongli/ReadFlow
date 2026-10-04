import { useEffect, useState } from "react";
import { useReaderChat } from "@/features/reader-assistance/index.js";
import { Button } from "@/ui/wb/Button.js";
import { cardQuestion, cardSuggestion } from "../domain/ai-suggestion.js";
import type { CardKind, CardSource } from "../domain/model.js";
export function AiSuggestion({
  source,
  kind,
  apply,
}: {
  source: CardSource;
  kind: CardKind;
  apply: (suggestion: { front: string; back: string }) => void;
}) {
  const chat = useReaderChat(source.item_id);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setRemember(false), [chat.pending?.target]);
  useEffect(() => {
    if (!chat.sent) return;
    const answer = [...chat.messages].reverse().find((message) => message.role === "assistant");
    const suggestion = cardSuggestion(answer?.body || "");
    if (suggestion) {
      apply(suggestion);
      setError("");
    } else setError("服务未返回有效的正反面建议，请重试或手动填写。");
  }, [chat.sent]);
  return (
    <div className="space-y-2 text-sm text-wb-text-3">
      <Button
        disabled={chat.busy || !source.quote.trim()}
        onClick={() => {
          setError("");
          void chat.send(cardQuestion(kind), { selection: source.quote, page: source.page, page_text: "" });
        }}
      >
        让 AI 出题（会发送这段文字）
      </Button>
      {chat.pending ? (
        <div role="region" aria-label="闪卡出题隐私确认" className="rounded-lg bg-wb-fill p-3">
          <p>将发送：所选段落、题名与摘要，以及本文献最近问答 → {chat.status?.service}。不会自动保存卡片。</p>
          <p>“本文献不再提示”也用于 AI 伴读；伴读还可能发送本页文字。</p>
          <label>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            本文献不再提示
          </label>
          <Button onClick={() => chat.approve(remember)}>发送</Button>
          <Button onClick={chat.cancel}>取消发送</Button>
        </div>
      ) : null}
      {chat.busy ? (
        <p role="status">
          正在生成建议… <Button onClick={chat.cancel}>停止</Button>
        </p>
      ) : null}
      {chat.error || error ? <p role="status">{chat.error?.message || error}</p> : null}
    </div>
  );
}
