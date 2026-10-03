import { useState, type ReactNode } from "react";
import type { PaperItem } from "@/platform/contracts/research-library.js";
import type { WorkbenchGroup, WorkbenchRow } from "@/platform/contracts/workbench.js";
import { cn } from "@/ui/lib/utils.js";
import { Chip } from "@/ui/wb/Chip.js";
import { ITEM_TYPE_LABEL, SOURCE_LABEL } from "../../domain/format.js";
import { compareGroupNames, groupLabel } from "../../domain/groups.js";
import { useWorkbench } from "../context.js";
import { GroupPicker } from "./GroupPicker.js";
import { InlineEdit } from "./InlineEdit.js";

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="m-0 text-[0.75rem] font-semibold text-wb-text-3">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wb-info-row relative flex items-baseline justify-between gap-3 px-3.5 py-2">
      <dt className="shrink-0 text-wb-text-3">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-right">{children}</dd>
    </div>
  );
}

export function GroupsSection({ row, groups }: { row: WorkbenchRow; groups: WorkbenchGroup[] }) {
  const wb = useWorkbench();
  const memberOf = groups.filter((group) => row.group_ids.includes(group.id)).sort(compareGroupNames);
  return (
    <Section title="分组">
      <div className="flex flex-wrap gap-1.5">
        {memberOf.map((group) => (
          <Chip key={group.id} size="md" title={groupLabel(groups, group.id)} removeLabel={`移出「${group.name}」`} onRemove={() => void wb.setMembership(group.id, [], [row.id])}>
            {group.name}
          </Chip>
        ))}
        <GroupPicker itemIds={[row.id]}>
          <button type="button" title="加入分组（G）" className="wb-transition h-[1.625rem] rounded-full border-0 bg-transparent px-2.5 text-[0.78125rem] text-wb-link hover:bg-wb-hover">加入分组…</button>
        </GroupPicker>
      </div>
    </Section>
  );
}

export function MetadataSection({ row }: { row: WorkbenchRow }) {
  const wb = useWorkbench();
  return (
    <Section title="信息">
      <dl className="m-0 overflow-hidden rounded-xl bg-wb-panel-2 text-[0.8125rem]">
        <Field label="类型">{ITEM_TYPE_LABEL[row.item_type] ?? row.item_type}</Field>
        <Field label="日期">{row.date || "—"}</Field>
        <Field label="出处">
          <InlineEdit value={row.venue} placeholder="添加期刊 / 会议" label="出处" className="text-right" onSave={(venue) => void wb.updateState(row.id, { venue })} />
        </Field>
        <Field label="DOI">
          {row.doi ? <a href={`https://doi.org/${row.doi}`} target="_blank" rel="noreferrer" className="text-wb-link hover:underline">{row.doi}</a> : "—"}
        </Field>
        <Field label="引用键">
          <InlineEdit value={row.citekey} placeholder="设置引用键" label="引用键" className="text-right"
            validate={(value) => (!value || /^[A-Za-z0-9_:\-.]{1,100}$/.test(value) ? null : "只能用字母、数字和 _ : - .")}
            onSave={(citekey) => void wb.updateState(row.id, { citekey }, citekey ? "引用键已固定" : "已恢复自动引用键")} />
          {row.citekey_pinned ? <span title="清空引用键可恢复自动生成" className="ml-1.5 whitespace-nowrap text-[0.6875rem] text-wb-text-3">已固定</span> : null}
        </Field>
        <Field label="标签"><span className="flex flex-wrap justify-end gap-1">{row.tags.length ? row.tags.map((tag) => <Chip key={tag}>{tag}</Chip>) : "—"}</span></Field>
        <Field label="来源">{SOURCE_LABEL[row.source] ?? row.source}</Field>
      </dl>
    </Section>
  );
}

export function AbstractSection({ item }: { item: PaperItem | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!item?.abstract) return null;
  return (
    <Section title="摘要" aside={<button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="border-0 bg-transparent p-0 text-[0.75rem] text-wb-link">{expanded ? "收起" : "展开"}</button>}>
      <p className={cn("m-0 text-[0.8125rem] leading-[1.55] text-wb-text-2", !expanded && "line-clamp-4")}>{item.abstract}</p>
    </Section>
  );
}
