import type { InputHTMLAttributes, ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

export type FieldSize = "md" | "sm";

/** Shared by Input and Select so every form control looks the same. */
export function controlClasses(size: FieldSize = "md", className?: string) {
  return cn(
    "w-full rounded-md border border-neutral-200 bg-white text-body text-neutral-900 transition-colors",
    "placeholder:text-neutral-400 hover:border-neutral-300",
    "focus:border-primary-400 focus:outline-none focus:ring-3 focus:ring-primary-100",
    "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400",
    "aria-invalid:border-danger-500 aria-invalid:focus:ring-danger-100",
    size === "md" ? "h-11 px-4" : "h-9 px-3",
    className,
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: FieldSize;
};

export function Input({ size, className, ...props }: InputProps) {
  return <input className={controlClasses(size, className)} {...props} />;
}

export function SearchInput({
  shortcut,
  className,
  ...props
}: Omit<InputProps, "size" | "type"> & { shortcut?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-neutral-500"
      />
      <input
        type="search"
        className={controlClasses("md", cn("pl-11", shortcut && "pr-14"))}
        {...props}
      />
      {shortcut && (
        <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-xs border bg-neutral-50 px-1.5 font-sans text-small text-neutral-500">
          {shortcut}
        </kbd>
      )}
    </div>
  );
}

/** Label, control, and an optional hint or error underneath. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-body font-medium text-neutral-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-small text-danger-700">{error}</p>
      ) : (
        hint && <p className="text-small text-neutral-500">{hint}</p>
      )}
    </div>
  );
}
