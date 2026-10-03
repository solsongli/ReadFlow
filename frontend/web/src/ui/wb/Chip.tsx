import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";

export interface ChipProps {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  title?: string;
  className?: string;
  size?: "sm" | "md";
}

export function Chip({ children, onRemove, removeLabel = "移除", title, className, size = "sm" }: ChipProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 rounded-full bg-wb-chip text-wb-chip-text",
        size === "sm" ? "h-5 px-1.5 text-[0.71875rem]" : "h-[1.625rem] px-2.5 text-[0.78125rem]",
        onRemove && "pr-0.5",
        className,
      )}
    >
      <span className="wb-truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border-0 bg-transparent text-wb-text-3 hover:bg-wb-line hover:text-wb-text"
        >
          <X size={10} strokeWidth={2.6} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", className)} />;
}
