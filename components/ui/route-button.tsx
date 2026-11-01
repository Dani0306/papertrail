"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { Button, type ButtonSize, type ButtonVariant } from "./button";

/**
 * A button that POSTs to one of our routes, shows a busy state until the route
 * answers and the page has refreshed, and shows the route's error inline.
 * Every write goes through a server route; this never talks to Supabase.
 */
export function RouteButton({
  endpoint,
  children,
  busyLabel,
  busyHint,
  variant = "primary",
  size = "md",
  preview,
}: {
  endpoint: string;
  children: ReactNode;
  busyLabel: string;
  /** Shown while busy, e.g. how long a run takes. */
  busyHint?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a fixed state for /design-system; the button does nothing. */
  preview?: "idle" | "busy" | { error: string };
}) {
  const router = useRouter();
  const [requesting, setRequesting] = useState(preview === "busy");
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(typeof preview === "object" ? preview.error : null);
  const busy = requesting || refreshing;

  async function run() {
    if (preview) return;
    setRequesting(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Something went wrong on our side. Try again.");
        return;
      }
      // The page re-renders from the server with the new status; stay busy until it has.
      startRefresh(() => router.refresh());
    } catch {
      setError("The request didn't reach the server. Check your connection and try again.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="relative z-10 flex flex-col items-start gap-1.5">
      <Button variant={variant} size={size} onClick={run} disabled={busy} aria-busy={busy}>
        {busy && <LoaderCircle aria-hidden className="motion-safe:animate-spin" />}
        {busy ? busyLabel : children}
      </Button>
      <p aria-live="polite" className="text-small">
        {busy && busyHint && <span className="text-neutral-500">{busyHint}</span>}
        {!busy && error && (
          <span className="flex items-start gap-1.5 text-danger-700">
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </span>
        )}
      </p>
    </div>
  );
}
