import type { HTMLAttributes } from "react";
import { cn } from "@/ui/lib/utils.js";

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] items-center rounded-[3px] border border-wb-line-strong px-1 font-wb-mono text-[11px] leading-none text-wb-text-3",
        className,
      )}
      {...props}
    />
  );
}
