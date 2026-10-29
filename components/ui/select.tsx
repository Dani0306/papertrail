import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { controlClasses, type FieldSize } from "./input";

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: FieldSize;
};

/** Native select, styled to match Input. Keeps keyboard and mobile behaviour for free. */
export function Select({ size, className, children, ...props }: SelectProps) {
  return (
    <div className={cn("relative", className)}>
      <select
        className={controlClasses(size, "appearance-none pr-10")}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-neutral-500"
      />
    </div>
  );
}
