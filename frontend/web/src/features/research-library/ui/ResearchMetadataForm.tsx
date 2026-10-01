import { useState } from "react";
import { Button } from "@/ui/Button.js";
import type { Collection, ItemInput } from "@/platform/contracts/research-library.js";
import { splitLines, splitTags } from "../domain/model.js";

const TYPES = [
  ["journalArticle", "期刊论文"], ["conferencePaper", "会议论文"], ["preprint", "预印本"], ["book", "书籍"],
  ["bookSection", "书籍章节"], ["thesis", "学位论文"], ["report", "报告"], ["webpage", "网页"], ["document", "文档"],
];
export function ResearchMetadataForm({ initial, collections, onSave, pending, label = "保存文献信息" }: {
  initial: ItemInput; collections: Collection[]; onSave: (value: ItemInput) => void; pending: boolean; label?: string;
}) {
  const [value, setValue] = useState(initial);
  const [authors, setAuthors] = useState(initial.authors.join("\n"));
  const [tags, setTags] = useState(initial.tags.join(", "));
  const set = (field: keyof ItemInput, next: string | string[]) => setValue((old) => ({ ...old, [field]: next }));
  return <form className="research-meta-form" onSubmit={(e) => { e.preventDefault(); onSave({ ...value, title: value.title.trim(), authors: splitLines(authors), tags: splitTags(tags) }); }}>
    <label className="research-field research-full">标题<input aria-label="文献标题" required maxLength={2000} value={value.title} onChange={(e) => set("title", e.target.value)} /></label>
    <label className="research-field">文献类型<select value={value.item_type} onChange={(e) => set("item_type", e.target.value)}>
      {!TYPES.some(([key]) => key === value.item_type) && <option value={value.item_type}>{value.item_type}</option>}
      {TYPES.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
    <label className="research-field">日期 / 年份<input aria-label="文献日期" value={value.date} onChange={(e) => set("date", e.target.value)} placeholder="2026 或 2026-09-30" /></label>
    <label className="research-field">作者（每行一位）<textarea aria-label="文献作者" rows={3} value={authors} onChange={(e) => setAuthors(e.target.value)} /></label>
    <label className="research-field">标签（逗号分隔）<textarea aria-label="文献标签" rows={3} value={tags} onChange={(e) => setTags(e.target.value)} /></label>
    <label className="research-field">DOI<input aria-label="文献DOI" value={value.doi} onChange={(e) => set("doi", e.target.value)} /></label>
    <label className="research-field">网址<input value={value.url} onChange={(e) => set("url", e.target.value)} /></label>
    <fieldset className="research-collections research-full"><legend>所属合集</legend>{collections.length ? collections.map((entry) =>
      <label key={entry.id}><input type="checkbox" checked={value.collection_ids.includes(entry.id)} onChange={(e) => set("collection_ids", e.target.checked ? [...value.collection_ids, entry.id] : value.collection_ids.filter((id) => id !== entry.id))} />{entry.name}</label>
    ) : <p className="muted">先在文献管理工具栏新建合集。</p>}</fieldset>
    <label className="research-field research-full">摘要<textarea rows={4} value={value.abstract} onChange={(e) => set("abstract", e.target.value)} /></label>
    <div className="research-form-actions research-full"><Button variant="default" type="submit" disabled={pending || !value.title.trim()}>{pending ? "保存中…" : label}</Button></div>
  </form>;
}
