import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { useFlashcards } from "./context.js";
import { request } from "../state/api.js";
import type { Card, Deck } from "../domain/model.js";
export interface TermCardSource {
  source: string;
  target: string;
  sentence: string;
  page: number;
}
export function TermCardPicker({
  item,
  terms,
  close,
}: {
  item: string;
  terms: TermCardSource[];
  close: () => void;
}) {
  const workspace = useFlashcards();
  const dialog = useRef<HTMLDialogElement>(null);
  const [deck, setDeck] = useState(workspace?.decks[0]?.id || "");
  const [name, setName] = useState("论文术语");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function save() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    let created = 0,
      duplicates = 0;
    try {
      let id = deck;
      if (!id) {
        id = (await request<Deck>("decks", "POST", { name: name.trim() || "论文术语" })).id;
        setDeck(id);
      }
      for (const term of terms) {
        const card = await request<Card & { duplicate?: boolean }>("flashcards", "POST", {
          item_id: item,
          deck_id: id,
          kind: "term",
          front: term.source,
          back: `${term.target}\n\n${term.sentence}\n\n(p. ${term.page})`,
          quote: term.sentence,
          translation: term.target,
          page: term.page,
        });
        if (card.duplicate) duplicates++;
        else created++;
      }
      await workspace?.reload();
      setMessage(`已加入 ${created} 张${duplicates ? ` · ${duplicates} 张已存在` : ""}。`);
    } catch {
      await workspace?.reload();
      setMessage(`已加入 ${created} 张，其余未完成。可重试，已有卡片不会重复创建。`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      role="dialog"
      ref={dialog}
      aria-label="术语加入闪卡"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      className="wb-dialog fixed inset-0 m-auto h-fit w-[30rem] max-w-[90vw] rounded-xl border-0 bg-wb-panel p-5 text-wb-text shadow-wb-pop"
    >
      <h2 className="m-0 text-lg font-semibold">术语加入闪卡 · {terms.length}</h2>
      <p className="text-xs text-wb-text-3">保留首次出现的原句和页码。同一篇文献的同一术语只创建一张。</p>
      <ul className="max-h-48 overflow-auto pl-4 text-sm">
        {terms.map((t) => (
          <li key={t.source}>
            {t.source} → {t.target} · p. {t.page}
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-2 text-sm">
        卡组
        <select
          aria-label="术语卡组"
          value={deck}
          className="min-w-0 flex-1 rounded-lg bg-wb-fill p-2"
          disabled={busy}
          onChange={(e) => setDeck(e.target.value)}
        >
          <option value="">新建卡组…</option>
          {workspace?.decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      {!deck ? (
        <input
          aria-label="新卡组名称"
          className="mt-2 w-full rounded-lg bg-wb-fill p-2"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-wb-text-3">
          {message}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button disabled={busy} onClick={close}>
          完成
        </Button>
        <Button variant="primary" disabled={busy || !terms.length} onClick={() => void save()}>
          {busy ? "正在保存…" : "加入卡组"}
        </Button>
      </div>
    </dialog>
  );
}
