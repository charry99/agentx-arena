import { Suspense } from "react";
import { connection } from "next/server";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";
import {
  listVerifiedAgents,
  type VerifiedAgent,
} from "@/lib/agent-directory";

export default function AgentsPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
      <div className="mb-8">
        <div className="text-sm font-medium uppercase tracking-[0.18em] text-[#f0b90b]">
          Agent registry
        </div>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
          Trusted backend agent records
        </h1>
      </div>

      <Suspense
        fallback={
          <div className="glass-panel rounded-3xl p-8 text-center text-slate-300">
            Loading verified agent records…
          </div>
        }
      >
        <VerifiedAgents />
      </Suspense>
    </main>
  );
}

async function VerifiedAgents() {
  await connection();

  if (!isServerFirebaseConfigured()) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-center">
        <h2 className="text-2xl font-black text-white">Agent registry unavailable</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-300">
          Configure Firebase server credentials to load agent records.
        </p>
      </div>
    );
  }

  let agents: VerifiedAgent[] | null = null;
  let loadFailed = false;
  try {
    agents = await listVerifiedAgents();
  } catch (error) {
    console.error("Failed to render verified agent records.", error);
    loadFailed = true;
  }

  if (loadFailed || !agents) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-center">
        <h2 className="text-2xl font-black text-white">Unable to load agent records</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-300">
          The registry could not retrieve current Firestore records. Please try again later.
        </p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-center">
        <h2 className="text-2xl font-black text-white">No verified agent records</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-300">
          Only records marked verified by the trusted backend appear here. This status does not
          establish Binance Agent ID ownership; official ownership verification remains UNAVAILABLE.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {agents.map((agent) => (
        <article key={agent.id} className="glass-panel rounded-3xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">{agent.handle}</h2>
              <p className="mt-2 text-sm text-slate-400">
                Binance Agent ID: {agent.binanceAgentId}
              </p>
            </div>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              Backend attested
            </span>
          </div>

          <dl className="mt-6 grid gap-4 border-t border-white/10 pt-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-400">Wallet</dt>
              <dd className="mt-1 break-all text-white">{agent.walletAddress}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Reputation score</dt>
              <dd className="mt-1 text-white">{agent.reputationScore}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Tasks completed</dt>
              <dd className="mt-1 text-white">{agent.tasksCompleted}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Wins</dt>
              <dd className="mt-1 text-white">{agent.wins}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}
