import { useState } from "react";
import type { Collection, ItemInput } from "./types";
import { splitLines, splitTags } from "./model";

const TYPES = [
  ["journalArticle", "期刊论文"], ["conferencePaper", "会议论文"], ["preprint", "预印本"],
  ["book", "书籍"], ["bookSection", "书籍章节"], ["thesis", "学位论文"],
  ["report", "报告"], ["webpage", "网页"], ["document", "文档"],
];
export function MetadataForm({ initial, collections, onSave, busy, buttonText = "保存文献信息" }: {
  initial: ItemInput; collections: Collection[]; onSave: (value: ItemInput) => void; busy: boolean; buttonText?: string;
}) {
  const [value, setValue] = useState(initial);
  const [authors, setAuthors] = useState(initial.authors.join("\n"));
  const [tags, setTags] = useState(initial.tags.join(", "));
  const set = (field: keyof ItemInput, next: string | string[]) => setValue((old) => ({ ...old, [field]: next }));
  return <form className="metadata-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...value, title: value.title.trim(), authors: splitLines(authors), tags: splitTags(tags) }); }}>
    <label className="field full">标题<input autoFocus required maxLength={2000} value={value.title} onChange={(e) => set("title", e.target.value)} /></label>
    <label className="field">类型<select value={value.item_type} onChange={(e) => set("item_type", e.target.value)}>
      {!TYPES.some(([key]) => key === value.item_type) && <option value={value.item_type}>{value.item_type}</option>}
      {TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>
    <label className="field">日期 / 年份<input value={value.date} placeholder="2026 或 2026-09-30" onChange={(e) => set("date", e.target.value)} /></label>
    <label className="field">作者（每行一位，保持顺序）<textarea rows={3} value={authors} onChange={(e) => setAuthors(e.target.value)} /></label>
    <label className="field">标签（逗号分隔）<textarea rows={3} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="方法, 待读" /></label>
    <label className="field">DOI<input value={value.doi} onChange={(e) => set("doi", e.target.value)} placeholder="10.xxxx/xxxxx" /></label>
    <label className="field">网址<input value={value.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" /></label>
    <fieldset className="collection-checks full"><legend>所属合集</legend>{collections.length ? collections.map((entry) =>
      <label key={entry.id}><input type="checkbox" checked={value.collection_ids.includes(entry.id)} onChange={(e) => set("collection_ids", e.target.checked ? [...value.collection_ids, entry.id] : value.collection_ids.filter((id) => id !== entry.id))} />{entry.name}</label>
    ) : <p className="subtle">在左侧“新建合集”后可为文献分类。</p>}</fieldset>
    <label className="field full">摘要<textarea rows={5} value={value.abstract} onChange={(e) => set("abstract", e.target.value)} /></label>
    <div className="form-footer full"><button className="primary" disabled={busy || !value.title.trim()} type="submit">{busy ? "保存中…" : buttonText}</button></div>
  </form>;
}
