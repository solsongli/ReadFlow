import { useState, type ReactNode } from "react";
import type { PaperItem } from "@/platform/contracts/research-library.js";
import type { WorkbenchGroup, WorkbenchRow } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { Chip } from "@/ui/wb/Chip.js";
import { ITEM_TYPE_LABEL, READ_STATUS_LABEL, readingPercent, SOURCE_LABEL, TEXT_STATUS_LABEL } from "../../domain/format.js";
import { compareGroupNames, groupLabel } from "../../domain/groups.js";
import { useWorkbench } from "../context.js";
import { GroupPicker } from "./GroupPicker.js";
import { InlineEdit } from "./InlineEdit.js";

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="border-t border-wb-line-soft px-4 pb-3">
      <div className="flex h-8 items-center justify-between">
        <h3 className="m-0 text-[11.5px] font-semibold text-wb-text-3">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-wb-text-3">{label}</dt>
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </>
  );
}

export function GroupsSection({ row, groups }: { row: WorkbenchRow; groups: WorkbenchGroup[] }) {
  const wb = useWorkbench();
  const memberOf = row.group_ids
    .map((id) => groups.find((group) => group.id === id))
    .filter(Boolean)
    .sort((a, b) => compareGroupNames(a as WorkbenchGroup, b as WorkbenchGroup)) as WorkbenchGroup[];
  return (
    <Section title="分组" aside={<span className="wb-numeric text-[11.5px] text-wb-text-3">{memberOf.length}</span>}>
      <div className="flex flex-wrap gap-1.5">
        {memberOf.map((group) => (
          <Chip
            key={group.id}
            size="md"
            title={groupLabel(groups, group.id)}
            removeLabel={`移出「${group.name}」`}
            onRemove={() => void wb.setMembership(group.id, [], [row.id])}
          >
            {groupLabel(groups, group.id)}
          </Chip>
        ))}
        <GroupPicker itemIds={[row.id]}>
          <button
            type="button"
            className="h-6 rounded-[5px] border border-dashed border-wb-line-strong bg-transparent px-2 text-[12px] text-wb-accent hover:border-wb-accent hover:bg-wb-accent-soft"
          >
            + 加入分组
          </button>
        </GroupPicker>
      </div>
    </Section>
  );
}

export function MetadataSection({ row }: { row: WorkbenchRow }) {
  const wb = useWorkbench();
  return (
    <Section title="元数据">
      <dl className="m-0 grid grid-cols-[56px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[12px]">
        <Field label="类型">{ITEM_TYPE_LABEL[row.item_type] ?? row.item_type}</Field>
        <Field label="作者">{row.authors.join(", ") || "—"}</Field>
        <Field label="日期"><span className="wb-numeric">{row.date || "—"}</span></Field>
        <Field label="出处">
          <InlineEdit value={row.venue} placeholder="添加期刊 / 会议" label="出处" onSave={(venue) => void wb.updateState(row.id, { venue })} />
        </Field>
        <Field label="DOI">
          {row.doi ? (
            <a href={`https://doi.org/${row.doi}`} target="_blank" rel="noreferrer" className="font-wb-mono text-wb-accent hover:underline">{row.doi}</a>
          ) : (
            <span className="text-wb-text-4">—</span>
          )}
        </Field>
        <Field label="引用键">
          <InlineEdit
            mono
            value={row.citekey}
            placeholder="设置引用键"
            label="引用键"
            validate={(value) => (!value || /^[A-Za-z0-9_:\-.]{1,100}$/.test(value) ? null : "只能用字母、数字和 _ : - .")}
            onSave={(citekey) => void wb.updateState(row.id, { citekey }, citekey ? "引用键已固定" : "已恢复自动引用键")}
          />
          {row.citekey_pinned ? <span className="ml-1.5 text-[11px] text-wb-text-3">已固定</span> : null}
        </Field>
        {row.tags.length ? (
          <Field label="标签">
            <span className="flex flex-wrap gap-1">{row.tags.map((tag) => <Chip key={tag}>{tag}</Chip>)}</span>
          </Field>
        ) : null}
        <Field label="来源">{SOURCE_LABEL[row.source] ?? row.source}</Field>
      </dl>
    </Section>
  );
}

function StatusLine({ ok, label, value }: { ok: boolean | null; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 shrink-0 rounded-sm", ok === true ? "bg-wb-accent" : ok === false ? "border-[1.5px] border-wb-warn" : "border-[1.5px] border-wb-line-strong")}
      />
      <span className="flex-1">{label}</span>
      <span className="text-wb-text-2">{value}</span>
    </div>
  );
}

const TRANSLATION_LABEL: Record<string, string> = {
  none: "未翻译",
  queued: "排队中",
  running: "翻译中",
  done: "已完成 · 阅读时可对照",
  failed: "最近一次失败",
  unknown: "状态未知",
};

export function StatusSection({ row }: { row: WorkbenchRow }) {
  const percent = readingPercent(row);
  const textOk = row.text_status === "native_text" || row.text_status === "ocr_complete" ? true
    : row.text_status === "needs_ocr" || row.text_status === "partial_needs_ocr" ? false : null;
  return (
    <Section title="处理状态">
      <div className="flex flex-col gap-1.5">
        <StatusLine ok={row.attachment_count > 0 ? true : null} label="PDF 附件" value={row.attachment_count ? `${row.page_count ?? "?"} 页` : "无"} />
        <StatusLine ok={textOk} label="文字层" value={TEXT_STATUS_LABEL[row.text_status] ?? row.text_status} />
        <StatusLine ok={row.title_translated ? true : null} label="中文题名" value={row.title_translated ? "已填写" : "未填写"} />
        <StatusLine
          ok={row.translation.status === "done" ? true : ["running", "queued", "failed"].includes(row.translation.status) ? false : null}
          label="全文译文"
          value={
            row.translation.status === "running" && row.translation.percent != null
              ? `翻译中 ${row.translation.percent}%`
              : TRANSLATION_LABEL[row.translation.status] ?? row.translation.status
          }
        />
        <StatusLine
          ok={row.read_status === "read" ? true : null}
          label="阅读"
          value={`${READ_STATUS_LABEL[row.read_status]}${percent != null && row.read_status === "reading" ? ` · ${percent}%` : ""}`}
        />
        <StatusLine ok={row.notes_count ? true : null} label="笔记 / 批注" value={`${row.notes_count - row.annotations_count} / ${row.annotations_count}`} />
      </div>
    </Section>
  );
}

export function AbstractSection({ item }: { item: PaperItem | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!item?.abstract) return null;
  return (
    <Section
      title="摘要"
      aside={
        <button type="button" onClick={() => setExpanded((value) => !value)} className="border-0 bg-transparent p-0 text-[12px] text-wb-accent">
          {expanded ? "收起" : "展开"}
        </button>
      }
    >
      <p className={cn("m-0 font-wb-serif text-[13px] leading-relaxed text-wb-text", !expanded && "line-clamp-6")}>{item.abstract}</p>
    </Section>
  );
}
