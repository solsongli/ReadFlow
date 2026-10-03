import type { ReactNode } from "react";
import { cn } from "@/ui/lib/utils.js";

export function WbEmptyState({ icon, title, hint, action, className }: {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-12 text-center", className)}>
      {icon ? <div className="text-wb-text-4">{icon}</div> : null}
      <p className="m-0 text-[0.9375rem] font-semibold text-wb-text">{title}</p>
      {hint ? <p className="m-0 max-w-sm text-[0.75rem] leading-relaxed text-wb-text-3">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function SectionLabel({ children, actions, className }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-6 items-center justify-between px-2 text-[0.71875rem] font-semibold text-wb-text-3", className)}>
      <span>{children}</span>
      {actions}
    </div>
  );
}
