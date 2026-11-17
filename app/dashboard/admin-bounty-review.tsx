"use client";

import { useCallback, useEffect, useState } from "react";

type ReviewDraft = {
  id: string;
  title: string;
  description: string;
  category: string;
  rewardAmount: number;
  reviewStatus: "pending" | "approved" | "rejected";
  submissionDeadline: string;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : fallback;
}

function parseReviewQueue(value: unknown): ReviewDraft[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("The bounty review queue response is invalid.");
  }

  return value.items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.description !== "string" ||
      typeof item.category !== "string" ||
      typeof item.rewardAmount !== "number" ||
      item.reviewStatus !== "pending" ||
      typeof item.submissionDeadline !== "string" ||
      typeof item.createdAt !== "string"
    ) {
      throw new Error("A bounty review item has an invalid shape.");
    }

    return {
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      rewardAmount: item.rewardAmount,
      reviewStatus: "pending",
      submissionDeadline: item.submissionDeadline,
      createdAt: item.createdAt,
    };
  });
}

async function fetchReviewQueue(): Promise<ReviewDraft[]> {
  const response = await fetch("/api/admin/bounties", { cache: "no-store" });
  const result: unknown = await response.json();
  if (!response.ok) {
    throw new Error(getErrorMessage(result, "Unable to load the review queue."));
  }
  return parseReviewQueue(result);
}

export default function AdminBountyReview() {
  const [items, setItems] = useState<ReviewDraft[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const loadQueue = useCallback(async () => {
    try {
      setItems(await fetchReviewQueue());
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load the review queue.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchReviewQueue()
      .then((queue) => {
        if (active) {
          setItems(queue);
          setMessage("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : "Unable to load the review queue.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function reviewDraft(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/bounties/${encodeURIComponent(id)}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, note: notes[id] ?? "" }),
        },
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(result, "Unable to review this draft."));
      }

      await loadQueue();
      setMessage(
        decision === "approve"
          ? "Content approved. The draft remains unpublished and unfunded."
          : "Draft rejected. No funding or publication state was changed.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to review this draft.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="glass-panel rounded-3xl p-6 lg:col-span-2">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-[#f0b90b]">
          Administrator workspace
        </div>
        <h2 className="mt-2 text-2xl font-bold text-white">Bounty content review</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Approval records a content decision only. It never publishes a bounty,
          verifies a deposit, or enables payouts.
        </p>
      </div>

      {message && (
        <p className="mt-4 text-sm text-amber-200" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p className="mt-5 text-sm text-slate-400">Loading review queue…</p>
      ) : items === null ? (
        <p className="mt-5 text-sm text-slate-400">
          The review queue could not be loaded.
        </p>
      ) : items.length === 0 ? (
        <p className="mt-5 text-sm text-slate-400">
          No bounty drafts are awaiting review.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-white/10 bg-[#07111f]/70 p-5"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {item.category} · {item.rewardAmount} USDC · deadline{" "}
                    {new Date(item.submissionDeadline).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs uppercase tracking-wide text-amber-200">
                  Draft · Unfunded
                </span>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                {item.description}
              </p>

              <label className="mt-4 block text-sm text-slate-300">
                Optional review note
                <textarea
                  maxLength={500}
                  rows={2}
                  value={notes[item.id] ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-[#f0b90b]"
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void reviewDraft(item.id, "approve")}
                  className="rounded-full bg-[#f0b90b] px-4 py-2 text-sm font-semibold text-[#0f172a] disabled:opacity-60"
                >
                  {busyId === item.id ? "Saving…" : "Approve content"}
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void reviewDraft(item.id, "reject")}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Reject draft
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
