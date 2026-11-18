import { connection, NextResponse } from "next/server";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";

export async function GET() {
  await connection();
  return NextResponse.json({
    ok: true,
    app: "BINANCE AGENT LAUNCHPAD",
    status: "operational",
    mode: isServerFirebaseConfigured() ? "firebase-configured" : "requires-config",
    firebase: isServerFirebaseConfigured(),
    timestamp: new Date().toISOString(),
  });
}
