import { connection, NextResponse } from "next/server";
import { getRuntimeConfigSummary } from "@/lib/runtime-config";

export async function GET() {
  // Read environment state per request. Without this, Cache Components
  // prerenders the handler at build time and serves a stale snapshot.
  await connection();
  const summary = getRuntimeConfigSummary();

  return NextResponse.json({
    ok: true,
    status: summary.missing.length > 0 ? "configuration-required" : "ready",
    firebase: {
      client: summary.firebaseClientConfigured,
      server: summary.firebaseServerConfigured,
    },
    binance: {
      mcpOAuthEncryptionConfigured: summary.binanceMcpEncryptionConfigured,
      identityVerification: "unavailable",
      financialActionsEnabled: false,
    },
    github: {
      configured: summary.githubConfigured,
    },
    auth: {
      configured: summary.authConfigured,
    },
    missingEnvironmentVariables: summary.missing,
    message:
      "Binance MCP authorization uses server-encrypted credentials. Binance Agent identity verification and financial actions remain unavailable.",
  });
}
