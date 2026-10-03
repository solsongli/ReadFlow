import type { ReactNode } from "react";
import { cn } from "@/ui/lib/utils.js";

export const SETTINGS_INPUT = "h-8 w-full min-w-0 rounded-lg border-0 bg-wb-fill px-2.5 text-[0.8125rem] text-wb-text outline-none disabled:opacity-50";
export function SettingsCard({ title, description, children }: { title?: string; description?: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className="flex flex-col gap-2">
    {title ? <h2 className="m-0 text-[0.8125rem] font-semibold">{title}</h2> : null}
    <div className="overflow-hidden rounded-xl bg-wb-panel-2">{children}</div>
    {description ? <p className="m-0 px-3 text-[0.75rem] leading-relaxed text-wb-text-3">{description}</p> : null}
  </section>;
}
export function SettingsRow({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="wb-info-row relative flex min-h-12 items-center justify-between gap-4 px-3.5 py-2">
    <span className="min-w-0 flex-1"><span>{label}</span>{hint ? <span className="mt-0.5 block text-[0.71875rem] text-wb-text-3">{hint}</span> : null}</span>
    <div className="w-[60%] min-w-0 max-w-[380px]">{children}</div>
  </div>;
}
export function SettingsStatus({ message, tone = "" }: { message?: string; tone?: string }) {
  return message ? <p role={tone === "error" ? "alert" : "status"} className={cn("m-0 text-[0.75rem] leading-relaxed", tone === "error" ? "text-wb-danger" : "text-wb-text-3")}>{message}</p> : null;
}
