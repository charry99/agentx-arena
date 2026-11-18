"use client";

import { useEffect, useState, type FormEvent } from "react";

type RequestStatus = "pending" | "approved" | "rejected";

type OwnRequest = {
  status: RequestStatus;
  message: string | null;
  reviewNote: string | null;
} | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

function parseOwnRequest(value: unknown): OwnRequest {
  if (!isRecord(value) || !("request" in value)) {
    throw new Error("The access request response is invalid.");
  }
  const request = value.request;
  if (request === null) return null;
  if (
    !isRecord(request) ||
    (request.status !== "pending" &&
      request.status !== "approved" &&
      request.status !== "rejected")
  ) {
    throw new Error("The access request response is invalid.");
  }
  return {
    status: request.status,
    message: typeof request.message === "string" ? request.message : null,
    reviewNote: typeof request.reviewNote === "string" ? request.reviewNote : null,
  };
}

export default function RoleRequestCard() {
  const [request, setRequest] = useState<OwnRequest>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/role-requests", { cache: "no-store" });
        const result: unknown = await response.json();
        if (!response.ok) {
          throw new Error(getErrorMessage(result, "Unable to load your access request."));
        }
        if (active) setRequest(parseOwnRequest(result));
      } catch (error) {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : "Unable to load your access request.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/role-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: draft }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(result, "Unable to submit your request."));
      }
      setRequest({ status: "pending", message: draft.trim() || null, reviewNote: null });
      setDraft("");
      setMessage("Request submitted. An administrator will review it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit your request.");
    } finally {
      setBusy(false);
    }
  }

  const canRequest = !loading && (request === null || request.status === "rejected");

  return (
    <section className="glass-panel rounded-3xl p-6">
      <h2 className="text-lg font-bold text-white">Sponsor access</h2>
      <p className="mt-2 text-sm text-slate-300">
        Sponsors create bounty drafts for admin content review. Approval changes your account
        role only; it does not fund or publish anything.
      </p>

      {loading && <p className="mt-4 text-sm text-slate-400">Loading…</p>}

      {request?.status === "pending" && (
        <p className="mt-4 rounded-2xl border border-white/10 bg-[#0a1220] p-4 text-sm text-slate-200">
          Your request is pending review.
        </p>
      )}

      {request?.status === "rejected" && (
        <p className="mt-4 rounded-2xl border border-white/10 bg-[#0a1220] p-4 text-sm text-amber-200">
          Your last request was declined.
          {request.reviewNote ? ` Admin note: ${request.reviewNote}` : ""} You can submit a new one.
        </p>
      )}

      {canRequest && (
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <label className="text-sm text-slate-300">
            Why do you want to sponsor bounties? (optional)
            <textarea
              rows={3}
              maxLength={500}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-white outline-none focus:border-[#f0b90b]"
            />
          </label>
          <div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-[#f0b90b] px-5 py-3 text-sm font-semibold text-[#0f172a] disabled:opacity-60"
            >
              {busy ? "Submitting…" : "Request sponsor access"}
            </button>
          </div>
        </form>
      )}

      {message && (
        <p className="mt-4 text-sm text-amber-200" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
