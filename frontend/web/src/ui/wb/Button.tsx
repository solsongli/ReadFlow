// ReadFlow 工作台基础按钮。只用 wb-* 设计变量，不写字面色。
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/ui/lib/utils.js";
import { Kbd } from "./Kbd.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-wb-accent font-medium text-wb-on-accent hover:bg-wb-accent-hover",
  secondary: "border-wb-line-strong bg-wb-panel text-wb-text hover:bg-wb-hover",
  ghost: "border-transparent bg-transparent text-wb-text-2 hover:bg-wb-hover hover:text-wb-text",
  danger: "border-wb-line-strong bg-wb-panel text-wb-danger hover:bg-wb-danger-soft",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-6 gap-1.5 rounded-[5px] px-2 text-[12px]",
  md: "h-7 gap-1.5 rounded-md px-2.5 text-[12.5px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  shortcut?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, shortcut, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap border transition-colors duration-100",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {shortcut ? <Kbd className={variant === "primary" ? "border-transparent bg-transparent text-current opacity-80" : ""}>{shortcut}</Kbd> : null}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "xs" | "sm" | "md";
  active?: boolean;
}

const ICON_SIZE = { xs: "h-5 w-5 rounded", sm: "h-6 w-6 rounded-[5px]", md: "h-7 w-7 rounded-md" };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", active = false, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border-0 transition-colors duration-100",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-wb-accent-tint text-wb-accent" : "bg-transparent text-wb-text-3 hover:bg-wb-hover hover:text-wb-text",
        ICON_SIZE[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
