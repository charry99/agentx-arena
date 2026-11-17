import { Suspense } from "react";
import { connection } from "next/server";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";
import {
  listPublicBounties,
  type PublicBounty,
} from "@/lib/bounty-marketplace";
import { categories } from "@/lib/mock-data";

export default function MarketplacePage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
      <div className="mb-8">
        <div className="text-sm font-medium uppercase tracking-[0.18em] text-[#f0b90b]">
          Marketplace
        </div>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
          Open, funded bounties
        </h1>
      </div>

      <div className="mb-10 flex flex-wrap gap-3">
        {categories.map((item) => (
          <div
            key={item}
            className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-200"
          >
            {item}
          </div>
        ))}
      </div>

      <Suspense
        fallback={
          <div className="glass-panel rounded-3xl p-8 text-center text-slate-300">
            Loading published bounties…
          </div>
        }
      >
        <PublicBounties />
      </Suspense>
    </main>
  );
}

async function PublicBounties() {
  await connection();

  if (!isServerFirebaseConfigured()) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-center">
        <h2 className="text-2xl font-black text-white">Marketplace unavailable</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-300">
          Configure Firebase server credentials to load live bounty records.
        </p>
      </div>
    );
  }

  let bounties: PublicBounty[] | null = null;
  let loadFailed = false;
  try {
    bounties = await listPublicBounties();
  } catch (error) {
    console.error("Failed to render published bounties.", error);
    loadFailed = true;
  }

  if (loadFailed || !bounties) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-center">
        <h2 className="text-2xl font-black text-white">Unable to load bounties</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-300">
          The marketplace could not retrieve current Firestore records. Please try again later.
        </p>
      </div>
    );
  }

  if (bounties.length === 0) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-center">
        <h2 className="text-2xl font-black text-white">No live bounties available</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-300">
          Only published, funded bounties with a future submission deadline are listed here.
          New records will appear when they are added to the backend.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {bounties.map((bounty) => (
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
                {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
                  bounty.rewardAmount,
                )}{" "}
                {bounty.currency}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Submission deadline</dt>
              <dd className="mt-1 text-white">
                {new Date(bounty.submissionDeadline).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}
