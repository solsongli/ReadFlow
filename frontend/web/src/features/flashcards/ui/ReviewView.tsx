import { useEffect, useMemo, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { reviewQueue, schedule, type Card } from "../domain/model.js";
import { request } from "../state/api.js";
import { useFlashcards } from "./context.js";
import { CardManager } from "./CardManager.js";
export function ReviewView({ active = true }: { active?: boolean }) {
  const w = useFlashcards()!;
  const [deck, setDeck] = useState(() => {
    try {
      return localStorage.getItem("readflow.review.deck") || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("readflow.review.deck", deck);
    } catch {
      /* Optional checkpoint. */
    }
  }, [deck]);
  const [reviewing, setReviewing] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(() => {
    try {
      return localStorage.getItem("readflow.review.cursor") || "";
    } catch {
      return "";
    }
  });
  const queue = useMemo(
    () =>
      reviewQueue(w.cards, w.logs, w.day, w.limits.newCards, w.limits.reviews).filter(
        (c) => !deck || c.deck_id === deck,
      ),
    [w.cards, w.logs, w.day, w.limits, deck],
  );
  const current = queue.find((c) => c.id === cursor) || queue[0];
  useEffect(() => {
    if (current) {
      try {
        localStorage.setItem("readflow.review.cursor", current.id);
      } catch {
        /* Optional checkpoint. */
      }
    }
    setFlipped(false);
  }, [current?.id, reviewing]);
  async function rate(rating: number) {
    if (!current || busy || !flipped) return;
    setBusy(true);
    try {
      await request<Card>(`flashcards/${current.id}/review`, "POST", {
        rating,
        day: w.day,
        version: current.version,
      });
      setCursor(queue.find((card) => card.id !== current.id)?.id || "");
      await w.reload();
      setFlipped(false);
      setError("");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !active ||
        !reviewing ||
        !current ||
        event.isComposing ||
        (event.target as Element).closest("input,textarea,select,[role=dialog]")
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        setFlipped(true);
      }
      if (flipped && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        void rate(Number(event.key));
      }
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        w.source(current);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active, reviewing, current, flipped, busy]);
  const reviewed = new Set(
    w.logs
      .filter((log) => !deck || w.cards.some((card) => card.id === log.card_id && card.deck_id === deck))
      .map((log) => log.card_id),
  ).size;
  return (
    <main aria-label="复习" className="wb-scroll min-w-0 flex-1 overflow-auto bg-wb-desk-bg p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">复习</h1>
        <select
          aria-label="复习卡组"
          value={deck}
          onChange={(e) => {
            setDeck(e.target.value);
            setCursor("");
          }}
          className="rounded-lg border-0 bg-wb-fill p-2"
        >
          <option value="">全部卡组</option>
          {w.decks.map((d) => (
            <option value={d.id} key={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <Button onClick={() => setReviewing(!reviewing)}>{reviewing ? "管理闪卡" : "开始复习"}</Button>
      </header>
      {w.error || error ? (
        <p role="status">
          {w.error || error} <Button onClick={() => void w.reload()}>重试</Button>
        </p>
      ) : null}
      {reviewing ? (
        <section className="mx-auto max-w-3xl space-y-4 py-6">
          <div className="text-wb-text-3">
            已复习 {reviewed} 张 · 剩余 {queue.length} 张
          </div>
          <progress
            aria-label="今日复习进度"
            className="w-full"
            value={reviewed}
            max={reviewed + queue.length || 1}
          />
          {current ? (
            <article className="rounded-xl bg-wb-panel p-8 shadow-wb-pop">
              <p className="text-sm text-wb-text-3">{w.decks.find((d) => d.id === current.deck_id)?.name}</p>
              <h2 className="whitespace-pre-wrap text-2xl leading-relaxed">{current.front}</h2>
              {flipped ? (
                <div className="space-y-4" aria-label="闪卡背面">
                  <p className="whitespace-pre-wrap text-lg">{current.back}</p>
                  <blockquote className="m-0 whitespace-pre-wrap rounded-xl border-l-2 border-wb-accent bg-wb-fill p-4 font-wb-serif">
                    {current.quote}
                  </blockquote>
                  {current.translation ? <p className="whitespace-pre-wrap">{current.translation}</p> : null}
                  <p className="whitespace-pre-wrap">{current.explanation}</p>
                  <Button onClick={() => w.source(current)}>
                    {current.item_title} · 第 {current.page} 页 · 回到原文
                  </Button>
                  {current.orphaned ? <p className="text-wb-text-3">原批注已删除 · 静态卡片</p> : null}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {["重来", "困难", "良好", "简单"].map((label, index) => (
                      <Button key={label} disabled={busy} onClick={() => void rate(index + 1)}>
                        {label} · {schedule(current, index + 1).interval || "本轮"}
                        {schedule(current, index + 1).interval ? " 天" : "重学"}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <Button onClick={() => setFlipped(true)}>显示答案（空格）</Button>
              )}
            </article>
          ) : (
            <p className="py-16 text-center text-wb-text-3">今天的复习已完成。可以去论文里收集新的片段。</p>
          )}
        </section>
      ) : (
        <CardManager deck={deck} />
      )}
    </main>
  );
}
