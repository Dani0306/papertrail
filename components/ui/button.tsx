import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "text";
export type ButtonSize = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-body font-medium whitespace-nowrap transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 " +
  "disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-500 text-white shadow-sm hover:bg-primary-600 active:bg-primary-700 disabled:bg-primary-200 disabled:shadow-none",
  secondary:
    "border border-primary-500 bg-white text-primary-600 hover:bg-primary-50 active:bg-primary-100 disabled:border-primary-200 disabled:bg-white disabled:text-primary-300",
  tertiary:
    "border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100 disabled:bg-white disabled:text-neutral-400",
  text: "text-primary-600 hover:text-primary-700 hover:underline underline-offset-4 disabled:text-primary-300 disabled:no-underline",
};

// 44px is the default from the reference; 36px is for dense review tables.
const sizes: Record<ButtonSize, string> = {
  md: "h-11 px-4",
  sm: "h-9 px-3",
};

/** Class string for anything that should look like a button, e.g. a next/link. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(base, variants[variant], variant !== "text" && sizes[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}
