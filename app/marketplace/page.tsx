import { Suspense } from "react";
import { connection } from "next/server";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";
import {
  listPublicBounties,
  type PublicBounty,
} from "@/lib/bounty-marketplace";
import BountyBrowser from "./bounty-browser";

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

  return <BountyBrowser bounties={bounties} />;
}
