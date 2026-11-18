"use client";

import { useCallback, useEffect, useState } from "react";

type PendingRequest = {
  userId: string;
  email: string | null;
  displayName: string | null;
  message: string | null;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

function parseQueue(value: unknown): PendingRequest[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("The access request queue response is invalid.");
  }
  return value.items.map((item) => {
    if (!isRecord(item) || typeof item.userId !== "string" || typeof item.createdAt !== "string") {
      throw new Error("An access request has an invalid shape.");
    }
    return {
      userId: item.userId,
      email: typeof item.email === "string" ? item.email : null,
      displayName: typeof item.displayName === "string" ? item.displayName : null,
      message: typeof item.message === "string" ? item.message : null,
      createdAt: item.createdAt,
    };
  });
}

async function fetchQueue(): Promise<PendingRequest[]> {
  const response = await fetch("/api/admin/role-requests", { cache: "no-store" });
  const result: unknown = await response.json();
  if (!response.ok) {
    throw new Error(getErrorMessage(result, "Unable to load access requests."));
  }
  return parseQueue(result);
}

export default function AdminRoleRequests() {
  const [items, setItems] = useState<PendingRequest[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const reload = useCallback(async () => {
    try {
      setItems(await fetchQueue());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load access requests.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchQueue()
      .then((queue) => {
        if (active) setItems(queue);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Unable to load access requests.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function review(userId: string, decision: "approve" | "reject") {
    setBusyId(userId);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/role-requests/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: notes[userId] ?? "" }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(result, "Unable to review this request."));
      }
      await reload();
      setMessage(
        decision === "approve" ? "Sponsor access granted." : "Sponsor access request declined.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to review this request.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="glass-panel rounded-3xl p-6 lg:col-span-2">
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-[#f0b90b]">
        Administrator workspace
      </div>
      <h2 className="mt-2 text-2xl font-bold text-white">Sponsor access requests</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        Approving changes the account role from agent to sponsor. Only grant it to accounts you
        trust to write public-facing bounty content.
      </p>

      {message && (
        <p className="mt-4 text-sm text-amber-200" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p className="mt-5 text-sm text-slate-400">Loading requests…</p>
      ) : items === null ? (
        <p className="mt-5 text-sm text-slate-400">The requests could not be loaded.</p>
      ) : items.length === 0 ? (
        <p className="mt-5 text-sm text-slate-400">No sponsor access requests are pending.</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {items.map((item) => (
            <li
              key={item.userId}
              className="rounded-2xl border border-white/10 bg-[#07111f]/70 p-5"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">
                    {item.displayName ?? item.email ?? item.userId}
                  </h3>
                  {item.email && <p className="mt-1 text-sm text-slate-400">{item.email}</p>}
                </div>
                <span className="text-xs text-slate-400">
                  Requested {item.createdAt.slice(0, 10)} (UTC)
                </span>
              </div>

              {item.message && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                  {item.message}
                </p>
              )}

              <label className="mt-4 block text-sm text-slate-300">
                Optional note to the user
                <input
                  maxLength={500}
                  value={notes[item.userId] ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [item.userId]: event.target.value }))
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-[#f0b90b]"
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void review(item.userId, "approve")}
                  className="rounded-full bg-[#f0b90b] px-4 py-2 text-sm font-semibold text-[#0f172a] disabled:opacity-60"
                >
                  {busyId === item.userId ? "Saving…" : "Grant sponsor access"}
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void review(item.userId, "reject")}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
