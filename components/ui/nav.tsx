import Link from "next/link";
import { cn } from "@/lib/cn";
import { Badge } from "./badge";
import { Logo } from "./logo";

// Routes land in week 2; until then these links 404.
const NAV_ITEMS = [
  { href: "/documents", label: "Documents" },
  { href: "/review", label: "Review queue" },
  { href: "/exports", label: "Exports" },
] as const;

export type NavHref = (typeof NAV_ITEMS)[number]["href"];

export function Nav({ current }: { current?: NavHref }) {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-10 gap-y-3 px-4 py-3 sm:h-16 sm:flex-nowrap sm:px-6 sm:py-0">
        <Link
          href="/"
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500"
        >
          <Logo />
        </Link>
        {/* Wraps to its own row under the logo on small screens */}
        <nav aria-label="Main" className="order-last flex w-full gap-6 sm:order-none sm:w-auto">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.href === current ? "page" : undefined}
              className={cn(
                "rounded-xs text-body font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500",
                item.href === current
                  ? "text-primary-600"
                  : "text-neutral-600 hover:text-neutral-900",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Badge tone="primary" className="ml-auto">
          Demo mode
        </Badge>
      </div>
    </header>
  );
}
