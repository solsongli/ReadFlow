import type { HTMLAttributes } from "react";
import { cn } from "@/ui/lib/utils.js";

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] items-center rounded px-1 font-wb-sans text-[11px] leading-none text-wb-text-3",
        className,
      )}
      {...props}
    />
  );
}
