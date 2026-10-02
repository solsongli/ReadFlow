// 下拉菜单 / 弹出层的工作台皮肤（Radix 原语，非 Dialog）。
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Check } from "lucide-react";
import { DropdownMenu, Popover } from "radix-ui";
import { cn } from "@/ui/lib/utils.js";

const SURFACE = "z-50 rounded-xl border-0 bg-wb-panel text-wb-text shadow-wb-pop outline-none";

export const MenuRoot = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ className, sideOffset = 4, ...props }: ComponentPropsWithoutRef<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content sideOffset={sideOffset} className={cn(SURFACE, "min-w-48 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-auto p-1.5 text-[13px]", className)} {...props} />
    </DropdownMenu.Portal>
  );
}

const ITEM = cn(
  "wb-transition flex h-8 cursor-default select-none items-center gap-2 rounded-lg px-2 outline-none",
  "data-[highlighted]:bg-wb-hover data-[disabled]:opacity-45",
);

export function MenuItem({
  className,
  icon,
  shortcut,
  danger,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { icon?: ReactNode; shortcut?: string; danger?: boolean }) {
  return (
    <DropdownMenu.Item className={cn(ITEM, danger && "text-wb-danger", className)} {...props}>
      <span className="inline-flex w-4 shrink-0 justify-center text-wb-text-3">{icon}</span>
      <span className="flex-1">{children}</span>
      {shortcut ? <span className="text-[11px] text-wb-text-4">{shortcut}</span> : null}
    </DropdownMenu.Item>
  );
}

export function MenuCheckboxItem({ className, children, ...props }: ComponentPropsWithoutRef<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem className={cn(ITEM, className)} {...props}>
      <span className="inline-flex w-4 shrink-0 justify-center text-wb-link">
        <DropdownMenu.ItemIndicator>
          <Check size={13} strokeWidth={2.4} aria-hidden="true" />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="flex-1">{children}</span>
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuRadioGroup(props: ComponentPropsWithoutRef<typeof DropdownMenu.RadioGroup>) {
  return <DropdownMenu.RadioGroup {...props} />;
}

export function MenuRadioItem({ className, children, ...props }: ComponentPropsWithoutRef<typeof DropdownMenu.RadioItem>) {
  return (
    <DropdownMenu.RadioItem className={cn(ITEM, className)} {...props}>
      <span className="inline-flex w-4 shrink-0 justify-center text-wb-link">
        <DropdownMenu.ItemIndicator>
          <Check size={13} strokeWidth={2.4} aria-hidden="true" />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="flex-1">{children}</span>
    </DropdownMenu.RadioItem>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="mx-1 my-1 h-px bg-wb-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2 pb-1 pt-1.5 text-[11px] font-semibold text-wb-text-3">{children}</DropdownMenu.Label>;
}

export const PopoverRoot = Popover.Root;
export const PopoverTrigger = Popover.Trigger;
export const PopoverAnchor = Popover.Anchor;
export const PopoverClose = Popover.Close;

export function PopoverContent({ className, sideOffset = 6, align = "start", ...props }: ComponentPropsWithoutRef<typeof Popover.Content>) {
  return (
    <Popover.Portal>
      <Popover.Content sideOffset={sideOffset} align={align} className={cn(SURFACE, className)} {...props} />
    </Popover.Portal>
  );
}
