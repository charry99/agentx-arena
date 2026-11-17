"use client";

import { useEffect, useState } from "react";

type ConnectionSummary = {
  status: "disconnected" | "pending" | "connected" | "unavailable";
  authorizedScopes: string[];
  readOnlyTools: string[];
  identityVerification: "UNAVAILABLE";
  financialActionsEnabled: false;
  updatedAt: string | null;
};

const EMPTY_CONNECTION: ConnectionSummary = {
  status: "disconnected",
  authorizedScopes: [],
  readOnlyTools: [],
  identityVerification: "UNAVAILABLE",
  financialActionsEnabled: false,
  updatedAt: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseConnection(value: unknown): ConnectionSummary {
  if (
    !isRecord(value) ||
    (value.status !== "disconnected" &&
      value.status !== "pending" &&
      value.status !== "connected" &&
      value.status !== "unavailable") ||
    !isStringArray(value.authorizedScopes) ||
    !isStringArray(value.readOnlyTools) ||
    value.identityVerification !== "UNAVAILABLE" ||
    value.financialActionsEnabled !== false ||
    (value.updatedAt !== null && typeof value.updatedAt !== "string")
  ) {
    throw new Error("The Binance connection status response is invalid.");
  }

  return {
    status: value.status,
    authorizedScopes: value.authorizedScopes,
    readOnlyTools: value.readOnlyTools,
    identityVerification: "UNAVAILABLE",
    financialActionsEnabled: false,
    updatedAt: value.updatedAt,
  };
}

function getErrorMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : fallback;
}

export default function BinanceMcpConnectionCard() {
  const [connection, setConnection] = useState(EMPTY_CONNECTION);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadConnection() {
      try {
        const response = await fetch("/api/binance/connection", {
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            getErrorMessage(result, "Unable to load Binance connection status."),
          );
        }
        if (!isRecord(result)) {
          throw new Error("The Binance connection status response is invalid.");
        }
        if (active) setConnection(parseConnection(result.connection));
      } catch (error) {
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load Binance connection status.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadConnection();
    return () => {
      active = false;
    };
  }, []);

  async function connect() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/binance/connection", {
        method: "POST",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          getErrorMessage(result, "Unable to start Binance authorization."),
        );
      }

      if (!isRecord(result) || typeof result.authorizationUrl !== "string") {
        throw new Error("The Binance authorization URL was not returned.");
      }

      const authorizationUrl = new URL(result.authorizationUrl);
      if (authorizationUrl.protocol !== "https:") {
        throw new Error("The Binance authorization URL is not secure.");
      }

      window.location.assign(authorizationUrl.toString());
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to start Binance authorization.",
      );
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/binance/connection", {
        method: "DELETE",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          getErrorMessage(result, "Unable to clear the Binance connection."),
        );
      }

      if (!isRecord(result)) {
        throw new Error("The Binance connection status response is invalid.");
      }
      setConnection(parseConnection(result.connection));
      setMessage(
        "Local connection data cleared. Revoke AGENTX ARENA access in Binance account settings too.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to clear the Binance connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  const canConnect =
    connection.status === "disconnected" || connection.status === "unavailable";

  return (
    <section className="glass-panel rounded-3xl p-6">
      <h2 className="text-lg font-bold text-white">Binance Agent OS</h2>
      <p className="mt-2 text-sm text-slate-300">
        Connect through Binance&apos;s official MCP authorization screen. Never enter
        your Binance password or token in AGENTX ARENA.
      </p>

      <dl className="mt-5 grid gap-3 text-sm">
        <div>
          <dt className="text-slate-400">MCP connection</dt>
          <dd className="mt-1 capitalize text-white">
            {loading ? "Loading" : connection.status}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Binance Agent identity verification</dt>
          <dd className="mt-1 text-white">UNAVAILABLE</dd>
        </div>
        <div>
          <dt className="text-slate-400">Financial actions in AGENTX ARENA</dt>
          <dd className="mt-1 text-white">Disabled</dd>
        </div>
      </dl>

      {connection.authorizedScopes.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-white">
            Scopes reported by Binance
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {connection.authorizedScopes.map((scope) => (
              <li
                key={scope}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300"
              >
                {scope}
              </li>
            ))}
          </ul>
        </div>
      )}

      {connection.readOnlyTools.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-white">
            Server-reported read-only tools
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-slate-300">
            {connection.readOnlyTools.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
        </div>
      )}

      {connection.status !== "connected" && (
        <p className="mt-5 text-xs leading-5 text-slate-400">
          On Binance&apos;s consent screen, grant only the read-only access you
          intend to use. Do not select Trade or Transfer. Market data is public;
          Account access is read-only. AGENTX ARENA never invokes MCP tools.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {canConnect && (
          <button
            type="button"
            onClick={connect}
            disabled={loading || busy}
            className="rounded-full bg-[#f0b90b] px-5 py-3 text-sm font-semibold text-[#0f172a] disabled:opacity-60"
          >
            {busy ? "Starting…" : "Connect Binance"}
          </button>
        )}
        {connection.status === "pending" && (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            Cancel pending connection
          </button>
        )}
        {connection.status === "connected" && (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
      </div>

      {message && (
        <p className="mt-4 text-sm text-amber-200" role="status">
          {message}
        </p>
      )}

      <a
        href="https://developers.binance.com/en/docs/agent-native/mcp-server/agentic"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-block text-sm text-[#f0b90b] hover:underline"
      >
        Official Binance MCP setup and permissions
      </a>
    </section>
  );
}
