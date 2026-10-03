import { useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { cardsCsv } from "../domain/model.js";
import { request } from "../state/api.js";
import { useFlashcards } from "./context.js";
export function CardManager({ deck }: { deck: string }) {
  const w = useFlashcards()!;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cards = w.cards.filter(
    (card) =>
      (!deck || card.deck_id === deck) &&
      `${card.front} ${card.back} ${card.quote} ${card.tags}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function mutate(path: string, method: string, data?: unknown) {
    setBusy(true);
    try {
      await request(path, method, data);
      await w.reload();
      setDeleting("");
      setError("");
      if (path === "decks") {
        setCreating(false);
        setName("");
      }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <Button onClick={() => setCreating(!creating)}>新建卡组</Button>
      {creating ? (
        <div className="flex flex-wrap gap-2 rounded-xl bg-wb-fill p-3">
          <input
            aria-label="卡组名称"
            placeholder="卡组名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border-0 bg-wb-panel p-2"
          />
          <select
            aria-label="关联文献分组"
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            className="rounded-lg border-0 bg-wb-panel p-2"
          >
            <option value="">不关联分组</option>
            {w.groups.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <Button
            disabled={busy || !name.trim()}
            onClick={() =>
              void mutate("decks", "POST", {
                name,
                group_id: group || null,
              })
            }
          >
            创建卡组
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3 py-3">
        {w.decks.map((d) => (
          <div key={d.id} className="rounded-xl bg-wb-fill p-3">
            <strong>{d.name}</strong>
            <div className="text-sm text-wb-text-3">
              到期{" "}
              {
                w.cards.filter(
                  (c) => c.deck_id === d.id && !c.suspended && c.due <= w.day && c.due !== "0001-01-01",
                ).length
              }
              {" · "}新卡{" "}
              {w.cards.filter((c) => c.deck_id === d.id && !c.suspended && c.due === "0001-01-01").length}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <input
          aria-label="搜索闪卡"
          placeholder="搜索闪卡…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border-0 bg-wb-fill p-2"
        />
        <Button
          onClick={() => {
            const url = URL.createObjectURL(new Blob([cardsCsv(cards)], { type: "text/csv;charset=utf-8" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "ReadFlow-闪卡.csv";
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          导出 CSV
        </Button>
      </div>
      {error ? <p role="status">{error}</p> : null}
      {!cards.length ? (
        <p className="py-12 text-center text-wb-text-3">在论文中选取一段文字，点「做成闪卡」开始积累。</p>
      ) : null}
      {cards.map((card) => (
        <article key={card.id} className="rounded-xl bg-wb-panel-2 p-4">
          <h3 className="m-0 truncate" title={card.front}>
            {card.front}
          </h3>
          <p className="line-clamp-2 text-wb-text-3">{card.quote}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => w.edit(card)}>编辑</Button>
            <Button onClick={() => w.source(card)}>回到原文</Button>
            <Button
              disabled={busy}
              onClick={() => void mutate(`flashcards/${card.id}`, "PATCH", { suspended: !card.suspended })}
            >
              {card.suspended ? "恢复复习" : "暂停"}
            </Button>
            <Button onClick={() => setDeleting(card.id)}>删除…</Button>
          </div>
          {deleting === card.id ? (
            <div className="mt-2">
              删除卡片及其复习日志？原批注会保留。
              <Button disabled={busy} onClick={() => void mutate(`flashcards/${card.id}`, "DELETE")}>
                确认删除
              </Button>
              <Button onClick={() => setDeleting("")}>取消</Button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
