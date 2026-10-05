import { useEffect, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import type { PaperTerm, PaperTerms as Terms } from "../domain/model.js";

export function PaperTerms({
  value,
  save,
  retranslate,
  busy,
}: {
  value?: Terms;
  save: (entries: PaperTerm[], revision: number) => Promise<Terms>;
  retranslate: (ids: string[]) => void;
  busy: boolean;
}) {
  const [entries, setEntries] = useState<PaperTerm[]>(value?.entries || []);
  const [baseRevision, setBaseRevision] = useState(value?.revision || 0);
  const [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [affected, setAffected] = useState<string[]>(value?.affected || []);
  useEffect(() => {
    if (!dirty) {
      setEntries(value?.entries || []);
      setBaseRevision(value?.revision || 0);
    }
    setAffected(value?.affected || []);
  }, [value?.revision]);
  async function submit() {
    setSaving(true);
    try {
      const result = await save(entries, baseRevision);
      setBaseRevision(result.revision);
      setEntries(result.entries);
      setAffected(result.affected || []);
      setDirty(false);
      setMessage("术语已保存；已有译文不会静默改写。用户设置中的术语表优先。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <details className="rounded-xl bg-wb-fill p-3">
      <summary className="cursor-pointer text-sm font-semibold">术语 · {entries.length}</summary>
      <p className="text-xs text-wb-text-3">本篇译法可编辑；设置中的用户术语表优先。</p>
      {!entries.length ? (
        <p className="text-xs text-wb-text-3">首次全文翻译前统一本篇术语；也可先添加自己的译法。</p>
      ) : null}
      <div className="mt-2 max-h-64 space-y-2 overflow-auto">
        {entries.map((entry, index) => (
          <div key={index} className="grid grid-cols-2 gap-2">
            <input
              aria-label={`原术语 ${index + 1}`}
              value={entry.source}
              className="min-w-0 rounded-md bg-wb-panel p-1.5 text-xs"
              onChange={(e) => {
                setEntries(entries.map((r, i) => (i === index ? { ...r, source: e.target.value } : r)));
                setDirty(true);
              }}
            />
            <input
              aria-label={`术语译法 ${index + 1}`}
              value={entry.target}
              className="min-w-0 rounded-md bg-wb-panel p-1.5 text-xs"
              onChange={(e) => {
                setEntries(entries.map((r, i) => (i === index ? { ...r, target: e.target.value } : r)));
                setDirty(true);
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button
          size="sm"
          disabled={entries.length >= 100}
          onClick={() => {
            setEntries([...entries, { source: "", target: "" }]);
            setDirty(true);
          }}
        >
          添加术语
        </Button>
        <Button size="sm" disabled={!dirty || saving} onClick={() => void submit()}>
          保存术语
        </Button>
        {affected.length ? (
          <Button size="sm" disabled={dirty || busy || saving} onClick={() => retranslate(affected)}>
            按新术语重译相关块（{affected.length}）
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role="status" className="text-xs text-wb-text-3">
          {message}
        </p>
      ) : null}
    </details>
  );
}
