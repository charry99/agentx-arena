"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { categories } from "@/lib/mock-data";
import type { PublicBounty } from "@/lib/bounty-marketplace";

type SortKey = "newest" | "reward" | "deadline";

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-[#f0b90b]";

function formatDate(iso: string) {
  return `${iso.slice(0, 10)} (UTC)`;
}

function formatReward(amount: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount);
}

function SubmitPanel({ bountyId }: { bountyId: string }) {
  const [open, setOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setNeedsSignIn(false);
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bountyId,
          repoUrl: repoUrl.trim(),
          ...(evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {}),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 401) setNeedsSignIn(true);
        const error =
          typeof result === "object" && result !== null && "error" in result
            ? String((result as { error: unknown }).error)
            : "Unable to submit your work.";
        throw new Error(error);
      }
      setDone(true);
      setMessage("Submission received. It appears in your dashboard activity.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit your work.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="mt-5 text-sm text-emerald-300" role="status">
        {message}
      </p>
    );
  }

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-[#f0b90b]/50 px-4 py-2 text-sm font-semibold text-[#f0b90b] hover:bg-[#f0b90b]/10"
        >
          Submit work
        </button>
      ) : (
        <form onSubmit={submit} className="grid gap-3">
          <label className="text-sm text-slate-300">
            Repository URL (HTTPS)
            <input
              required
              type="url"
              inputMode="url"
              placeholder="https://github.com/you/your-agent"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="text-sm text-slate-300">
            Evidence URL (optional, HTTPS)
            <input
              type="url"
              inputMode="url"
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              className={inputClass}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-[#f0b90b] px-5 py-2.5 text-sm font-semibold text-[#0f172a] disabled:opacity-60"
            >
              {busy ? "Submitting…" : "Send submission"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-slate-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {message && (
        <p className="mt-3 text-sm text-amber-200" role="status">
          {message}{" "}
          {needsSignIn && (
            <Link href="/auth" className="text-[#f0b90b] underline">
              Sign in
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

export default function BountyBrowser({ bounties }: { bounties: PublicBounty[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = bounties.filter((bounty) => {
      if (category !== "all" && bounty.category !== category) return false;
      if (!needle) return true;
      return (
        bounty.title.toLowerCase().includes(needle) ||
        bounty.description.toLowerCase().includes(needle)
      );
    });

    return [...filtered].sort((left, right) => {
      if (sort === "reward") return right.rewardAmount - left.rewardAmount;
      if (sort === "deadline") {
        return left.submissionDeadline.localeCompare(right.submissionDeadline);
      }
      return right.createdAt.localeCompare(left.createdAt);
    });
  }, [bounties, query, category, sort]);

  return (
    <div>
      <div className="glass-panel mb-6 grid gap-4 rounded-3xl p-5 md:grid-cols-[1.4fr_1fr_1fr]">
        <label className="text-sm text-slate-300">
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title or description"
            className={inputClass}
          />
        </label>
        <label className="text-sm text-slate-300">
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={inputClass}
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Sort by
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className={inputClass}
          >
            <option value="newest">Newest</option>
            <option value="reward">Highest reward</option>
            <option value="deadline">Closing soonest</option>
          </select>
        </label>
      </div>

      <p className="mb-4 text-sm text-slate-400" role="status">
        Showing {visible.length} of {bounties.length} open bounties
      </p>

      {visible.length === 0 ? (
        <div className="glass-panel rounded-3xl p-8 text-center text-slate-300">
          No bounties match your filters.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {visible.map((bounty) => (
            <article key={bounty.id} className="glass-panel rounded-3xl p-6">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-[#f0b90b]">
                {bounty.category}
              </div>
              <h2 className="mt-3 text-2xl font-bold text-white">{bounty.title}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                {bounty.description}
              </p>

              {bounty.eligibility && bounty.eligibility.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-white">Eligibility</h3>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-300">
                    {bounty.eligibility.map((item, index) => (
                      <li key={`${bounty.id}-eligibility-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {bounty.evaluationCriteria && bounty.evaluationCriteria.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-white">Evaluation criteria</h3>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-300">
                    {bounty.evaluationCriteria.map((item, index) => (
                      <li key={`${bounty.id}-criteria-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <dl className="mt-6 grid gap-4 border-t border-white/10 pt-5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-400">Reward</dt>
                  <dd className="mt-1 font-semibold text-white">
                    {formatReward(bounty.rewardAmount)} {bounty.currency}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Submission deadline</dt>
                  <dd className="mt-1 text-white">{formatDate(bounty.submissionDeadline)}</dd>
                </div>
              </dl>

              <SubmitPanel bountyId={bounty.id} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
