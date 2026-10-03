import { ArrowDownUp } from "lucide-react";
import { IconButton } from "@/ui/wb/Button.js";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from "@/ui/wb/Menu.js";
import { COLORS, type Semantics } from "../../domain/annotations/types.js";
export function AnnotationFilters({
  labels,
  color,
  type,
  notes,
  onlyPage,
  sort,
  setColor,
  setType,
  setNotes,
  setOnlyPage,
  setSort,
}: {
  labels: Semantics;
  color: string;
  type: string;
  notes: string;
  onlyPage: boolean;
  sort: string;
  setColor: (value: string) => void;
  setType: (value: string) => void;
  setNotes: (value: string) => void;
  setOnlyPage: (value: boolean) => void;
  setSort: (value: string) => void;
}) {
  const pill =
    "shrink-0 rounded-full border-0 px-2.5 py-1 text-[0.75rem] " +
    "bg-wb-fill aria-pressed:bg-wb-selected aria-pressed:text-wb-link";
  return (
    <div className="flex items-center gap-1">
      <div aria-label="批注筛选" className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1">
        <button
          className={pill}
          aria-pressed={!color && !type && !notes && !onlyPage}
          onClick={() => {
            setColor("");
            setType("");
            setNotes("");
            setOnlyPage(false);
          }}
        >
          全部
        </button>
        {COLORS.map((value) => (
          <button
            key={value}
            className={pill}
            title={labels[value]}
            aria-label={`筛选${labels[value]}`}
            aria-pressed={color === value}
            onClick={() => setColor(color === value ? "" : value)}
          >
            <span data-annotation-color={value} className="pr-color block h-3 w-3 rounded-full" />
          </button>
        ))}
        {[
          ["sticky", "便签"],
          ["region", "框选"],
          ["ink", "手写"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={pill}
            aria-pressed={type === value}
            onClick={() => setType(type === value ? "" : value)}
          >
            {label}
          </button>
        ))}
        <button className={pill} aria-pressed={notes === "yes"} onClick={() => setNotes(notes ? "" : "yes")}>
          有说明
        </button>
        <button className={pill} aria-pressed={onlyPage} onClick={() => setOnlyPage(!onlyPage)}>
          本页
        </button>
      </div>
      <MenuRoot>
        <MenuTrigger asChild>
          <IconButton label="批注排序" title="批注排序">
            <ArrowDownUp size={14} />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => setSort("page")}>按页码{sort === "page" ? " ✓" : ""}</MenuItem>
          <MenuItem onSelect={() => setSort("time")}>按时间{sort === "time" ? " ✓" : ""}</MenuItem>
        </MenuContent>
      </MenuRoot>
    </div>
  );
}
