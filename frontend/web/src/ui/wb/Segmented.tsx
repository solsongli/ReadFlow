import { cn } from "@/ui/lib/utils.js";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

export function Segmented<T extends string>({ value, options, onChange, label, className }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex gap-0.5 rounded-md bg-wb-chip p-0.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-[22px] rounded border-0 px-2 text-[12px] transition-colors duration-100",
              active
                ? "bg-wb-panel text-wb-text shadow-[0_0_0_1px_var(--wb-line-strong)]"
                : "bg-transparent text-wb-text-3 hover:text-wb-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressBar({ value, tone = "accent", className, label }: { value: number; tone?: "accent" | "warn"; className?: string; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn("block h-1 overflow-hidden rounded-sm bg-wb-line", className)}
    >
      <span
        className={cn("block h-1", tone === "warn" ? "bg-wb-warn" : "bg-wb-accent")}
        style={{ width: `${clamped}%` }}
      />
    </span>
  );
}
