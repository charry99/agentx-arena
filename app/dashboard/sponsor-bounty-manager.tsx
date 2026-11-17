"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { categories } from "@/lib/mock-data";

type SponsorDraft = {
  id: string;
  title: string;
  description: string;
  category: string;
  rewardAmount: number;
  fundingStatus: "unfunded";
  reviewStatus: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  submissionDeadline: string;
  createdAt: string;
};

const INITIAL_FORM = {
  title: "",
  description: "",
  category: categories[0],
  rewardAmount: "",
  submissionDeadline: "",
  eligibility: "",
  evaluationCriteria: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : fallback;
}

function parseDrafts(value: unknown): SponsorDraft[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("The sponsor drafts response is invalid.");
  }

  return value.items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.description !== "string" ||
      typeof item.category !== "string" ||
      typeof item.rewardAmount !== "number" ||
      item.fundingStatus !== "unfunded" ||
      (item.reviewStatus !== "pending" &&
        item.reviewStatus !== "approved" &&
        item.reviewStatus !== "rejected") ||
      (item.reviewNote !== null && typeof item.reviewNote !== "string") ||
      typeof item.submissionDeadline !== "string" ||
      typeof item.createdAt !== "string"
    ) {
      throw new Error("A sponsor draft has an invalid shape.");
    }

    return {
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      rewardAmount: item.rewardAmount,
      fundingStatus: "unfunded",
      reviewStatus: item.reviewStatus,
      reviewNote: item.reviewNote,
      submissionDeadline: item.submissionDeadline,
      createdAt: item.createdAt,
    };
  });
}

async function fetchSponsorDrafts(): Promise<SponsorDraft[]> {
  const response = await fetch("/api/bounties/mine", { cache: "no-store" });
  const result: unknown = await response.json();
  if (!response.ok) {
    throw new Error(getErrorMessage(result, "Unable to load sponsor drafts."));
  }
  return parseDrafts(result);
}

function linesFromTextarea(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function SponsorBountyManager() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [drafts, setDrafts] = useState<SponsorDraft[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadDrafts = useCallback(async () => {
    try {
      setDrafts(await fetchSponsorDrafts());
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load sponsor drafts.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchSponsorDrafts()
      .then((items) => {
        if (active) {
          setDrafts(items);
          setMessage("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : "Unable to load sponsor drafts.",
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

  async function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const deadline = new Date(form.submissionDeadline);
      if (!Number.isFinite(deadline.getTime())) {
        throw new Error("Choose a valid submission deadline.");
      }

      const response = await fetch("/api/bounties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          category: form.category,
          rewardAmount: Number(form.rewardAmount),
          submissionDeadline: deadline.toISOString(),
          eligibility: linesFromTextarea(form.eligibility),
          evaluationCriteria: linesFromTextarea(form.evaluationCriteria),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(result, "Unable to submit the bounty draft."));
      }

      setForm(INITIAL_FORM);
      await loadDrafts();
      setMessage("Draft submitted for review. It is not published or funded.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to submit the bounty draft.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-panel rounded-3xl p-6 lg:col-span-2">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-[#f0b90b]">
          Sponsor workspace
        </div>
        <h2 className="mt-2 text-2xl font-bold text-white">Create a bounty draft</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          Drafts require admin content review. Approval does not publish a bounty
          or verify funding; this marketplace has no funding or payout workflow.
        </p>
      </div>

      <form onSubmit={submitDraft} className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-300">
          Title
          <input
            required
            maxLength={120}
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-[#f0b90b]"
          />
        </label>

        <label className="text-sm text-slate-300">
          Category
          <select
            value={form.category}
            onChange={(event) =>
              setForm((current) => ({ ...current, category: event.target.value }))
            }
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-[#f0b90b]"
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-300">
          Reward (USDC)
          <input
            required
            type="number"
            min="0.000001"
            step="any"
            value={form.rewardAmount}
            onChange={(event) =>
              setForm((current) => ({ ...current, rewardAmount: event.target.value }))
            }
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-[#f0b90b]"
          />
        </label>

        <label className="text-sm text-slate-300">
          Submission deadline
          <input
            required
            type="datetime-local"
            value={form.submissionDeadline}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                submissionDeadline: event.target.value,
              }))
            }
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-[#f0b90b]"
          />
        </label>

        <label className="text-sm text-slate-300 md:col-span-2">
          Description
          <textarea
            required
            maxLength={10_000}
            rows={5}
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-[#f0b90b]"
          />
        </label>

        <label className="text-sm text-slate-300">
          Eligibility (one item per line)
          <textarea
            rows={3}
            value={form.eligibility}
            onChange={(event) =>
              setForm((current) => ({ ...current, eligibility: event.target.value }))
            }
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-[#f0b90b]"
          />
        </label>

        <label className="text-sm text-slate-300">
          Evaluation criteria (one item per line)
          <textarea
            rows={3}
            value={form.evaluationCriteria}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                evaluationCriteria: event.target.value,
              }))
            }
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-[#f0b90b]"
          />
        </label>

        <div className="flex items-center md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-[#f0b90b] px-5 py-3 text-sm font-semibold text-[#0f172a] disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Submit draft for review"}
          </button>
        </div>
      </form>

      {message && (
        <p className="mt-4 text-sm text-amber-200" role="status">
          {message}
        </p>
      )}

      <div className="mt-8 border-t border-white/10 pt-6">
        <h3 className="text-lg font-semibold text-white">Your bounty drafts</h3>
        {loading ? (
          <p className="mt-3 text-sm text-slate-400">Loading drafts…</p>
        ) : drafts === null ? (
          <p className="mt-3 text-sm text-slate-400">
            Drafts could not be loaded. Use the message above and try again.
          </p>
        ) : drafts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">You have no bounty drafts.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {drafts.map((draft) => (
              <li key={draft.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-white">{draft.title}</h4>
                    <p className="mt-1 text-sm text-slate-400">
                      {draft.category} · {draft.rewardAmount} USDC ·{" "}
                      {new Date(draft.submissionDeadline).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right text-xs capitalize text-slate-300">
                    <div>Review: {draft.reviewStatus}</div>
                    <div>Funding: {draft.fundingStatus}</div>
                  </div>
                </div>
                {draft.reviewNote && (
                  <p className="mt-2 text-sm text-amber-200">
                    Admin note: {draft.reviewNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
