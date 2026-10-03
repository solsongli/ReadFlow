import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { cloze, type Card, type CardKind, type CardSource, type Deck } from "../domain/model.js";
import { request } from "../state/api.js";
import type { Workspace } from "./context.js";
export function CardEditor({
  draft,
  workspace: w,
  close,
}: {
  draft: Card | CardSource;
  workspace: Workspace;
  close: () => void;
}) {
  const existing = "id" in draft ? draft : null;
  const [kind, setKind] = useState<CardKind>(existing?.kind ?? "question");
  const [front, setFront] = useState(existing?.front ?? "");
  const [back, setBack] = useState(existing?.back ?? "");
  const [explanation, setExplanation] = useState(existing?.explanation ?? "");
  const [translation, setTranslation] = useState(draft.translation ?? "");
  const [tags, setTags] = useState(existing?.tags ?? "");
  const [deck, setDeck] = useState(existing?.deck_id ?? w.decks[0]?.id ?? "");
  const [name, setName] = useState("我的卡组");
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const linked = useRef(draft.annotation_id);
  const root = useRef<HTMLDivElement>(null);
  const quote = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLInputElement>('[aria-label="正面"]')?.focus();
    return () => previous?.focus();
  }, []);
  async function save(continueSelection = false) {
    if (busy || !front.trim()) return;
    setBusy(true);
    try {
      let deckId = deck;
      if (!deckId) {
        const created = await request<Deck>("decks", "POST", { name, group_id: group || null });
        deckId = created.id;
        setDeck(deckId);
      }
      if (!linked.current && draft.link) linked.current = await draft.link();
      await request(existing ? `flashcards/${existing.id}` : "flashcards", existing ? "PATCH" : "POST", {
        ...draft,
        link: undefined,
        kind,
        front,
        back,
        explanation,
        translation,
        tags,
        deck_id: deckId,
        annotation_id: linked.current || null,
      });
      await w.reload();
      close();
      if (continueSelection) window.getSelection()?.removeAllRanges();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field = "w-full rounded-lg border-0 bg-wb-fill p-2 text-[0.875rem]";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="做成闪卡"
      ref={root}
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-auto bg-wb-overlay p-6"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && !busy) close();
        if (event.ctrlKey && event.key === "Enter") {
          event.preventDefault();
          void save();
        }
        if (event.key === "Tab") {
          const controls = [
            ...root.current!.querySelectorAll<HTMLElement>("button:not(:disabled),input,textarea,select"),
          ];
          const target = event.shiftKey ? controls.at(-1) : controls[0];
          if (document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) {
            event.preventDefault();
            target?.focus();
          }
        }
      }}
    >
      <section className="mt-4 w-full max-w-2xl space-y-3 rounded-xl bg-wb-panel p-6 shadow-wb-pop">
        <h2 className="m-0 text-xl font-semibold">{existing ? "编辑闪卡" : "做成闪卡"}</h2>
        <p className="m-0 truncate text-sm text-wb-text-3" title={draft.item_title}>
          {draft.item_title || "来源文献"} · 第 {draft.page} 页
        </p>
        <div role="radiogroup" aria-label="卡型" className="inline-flex gap-1 rounded-lg bg-wb-fill p-1">
          {(
            [
              ["question", "问答"],
              ["cloze", "填空"],
              ["term", "术语"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              className={`rounded-md border-0 px-4 py-1.5 ${kind === value ? "bg-wb-panel shadow-wb-card" : "bg-transparent"}`}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {kind === "cloze" ? (
          <div>
            <p className="text-wb-text-3">在原文中选词，再点「挖空」。</p>
            <textarea ref={quote} aria-label="挖空原文" readOnly value={draft.quote} className={field} />
            <Button
              onClick={() => {
                try {
                  setFront(cloze(draft.quote, quote.current!.selectionStart, quote.current!.selectionEnd));
                } catch (failure) {
                  setError((failure as Error).message);
                }
              }}
            >
              挖空
            </Button>
          </div>
        ) : null}
        <label className="block">
          {kind === "term" ? "术语" : "正面"}
          <textarea
            aria-label="正面"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            className={field}
          />
        </label>
        <label className="block">
          {kind === "term" ? "定义" : "答案"}
          <textarea
            aria-label="背面"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            className={field}
          />
        </label>
        <blockquote className="m-0 max-h-32 overflow-auto rounded-lg border-l-2 border-wb-accent bg-wb-fill p-3 font-wb-serif">
          {draft.quote}
        </blockquote>
        <label className="block">
          译文
          <textarea
            aria-label="译文"
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            className={field}
          />
        </label>
        <label className="block">
          我的解释
          <textarea
            aria-label="我的解释"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className={field}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            卡组
            <select
              aria-label="卡组"
              className={field}
              value={deck}
              onChange={(e) => setDeck(e.target.value)}
            >
              {w.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              <option value="">新建卡组…</option>
            </select>
          </label>
          <label>
            标签
            <input
              aria-label="标签"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className={field}
            />
          </label>
        </div>
        {!deck ? (
          <div className="flex gap-2">
            <input
              aria-label="新卡组名称"
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              aria-label="关联分组"
              className={field}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">不关联分组</option>
              {w.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {error ? <p role="status">{error}</p> : null}
        <footer className="flex justify-end gap-2">
          <Button disabled={busy} onClick={close}>
            取消
          </Button>
          <Button disabled={busy || !front.trim()} onClick={() => void save(true)}>
            保存并继续选取
          </Button>
          <Button disabled={busy || !front.trim()} onClick={() => void save()}>
            保存
          </Button>
        </footer>
      </section>
    </div>
  );
}
