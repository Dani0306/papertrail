import { describe, expect, it } from "vitest";
import { needsAttention, queueOrder } from "./queue";

const doc = (id: string, status: "uploaded" | "extracting" | "extracted" | "needs_human" | "reviewed", toReview: number, createdAt: string) => ({
  id,
  status,
  toReview,
  createdAt,
});

describe("queueOrder", () => {
  it("puts needs_human first, then the most fields to review, then the oldest", () => {
    const { queue, clear } = queueOrder([
      doc("one-flag-new", "extracted", 1, "2026-11-01T12:00:00Z"),
      doc("three-flags", "extracted", 3, "2026-11-01T10:00:00Z"),
      doc("human-new", "needs_human", 0, "2026-11-01T11:00:00Z"),
      doc("one-flag-old", "extracted", 1, "2026-10-31T09:00:00Z"),
      doc("human-old", "needs_human", 0, "2026-10-30T09:00:00Z"),
    ]);
    expect(queue.map((d) => d.id)).toEqual(["human-old", "human-new", "three-flags", "one-flag-old", "one-flag-new"]);
    expect(clear).toBe(0);
  });

  it("leaves out documents with nothing for a person to do, and counts them", () => {
    const { queue, clear } = queueOrder([
      doc("clean", "extracted", 0, "2026-11-01T10:00:00Z"),
      doc("done", "reviewed", 2, "2026-11-01T10:00:00Z"),
      doc("waiting", "uploaded", 0, "2026-11-01T10:00:00Z"),
      doc("running", "extracting", 0, "2026-11-01T10:00:00Z"),
      doc("flagged", "extracted", 2, "2026-11-01T10:00:00Z"),
    ]);
    expect(queue.map((d) => d.id)).toEqual(["flagged"]);
    expect(clear).toBe(4);
  });

  it("treats a reviewed document as done even with flags left", () => {
    expect(needsAttention(doc("r", "reviewed", 5, "2026-11-01T10:00:00Z"))).toBe(false);
  });
});
