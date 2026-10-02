// ReadFlow 工作台基础按钮。只用 wb-* 设计变量，不写字面色。
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/ui/lib/utils.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-wb-accent font-medium text-wb-on-accent hover:bg-wb-accent-hover",
  secondary: "border-transparent bg-wb-fill text-wb-text hover:bg-wb-hover",
  ghost: "border-transparent bg-transparent text-wb-text-2 hover:bg-wb-hover hover:text-wb-text",
  danger: "border-transparent bg-wb-fill text-wb-danger hover:bg-wb-danger-soft",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 rounded-lg px-2 text-[12px]",
  md: "h-8 gap-2 rounded-lg px-3.5 text-[13px]",
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
      title={shortcut ? `${typeof children === "string" ? children : "操作"}（${shortcut}）` : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap border transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "xs" | "sm" | "md";
  active?: boolean;
}

const ICON_SIZE = { xs: "h-5 w-5 rounded-md", sm: "h-6 w-6 rounded-lg", md: "h-7 w-[30px] rounded-lg" };

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
        "inline-flex shrink-0 items-center justify-center border-0 transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-wb-accent-tint text-wb-link" : "bg-transparent text-wb-text-3 hover:bg-wb-hover hover:text-wb-text",
        ICON_SIZE[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
