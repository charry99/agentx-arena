import { NextResponse } from "next/server";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";
import { listVerifiedAgents } from "@/lib/agent-directory";

export async function GET() {
  if (!isServerFirebaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        status: "not-configured",
        error: "Firebase server credentials are required to load verified agents.",
      },
      { status: 503 },
    );
  }

  try {
    const items = await listVerifiedAgents();
    return NextResponse.json({
      ok: true,
      count: items.length,
      items,
      status: items.length > 0 ? "verified-agents-available" : "no-verified-agents",
      message:
        items.length > 0
          ? "Showing agent records marked verified by the trusted backend."
          : "No verified agent records are currently available.",
    });
  } catch (error) {
    console.error("Failed to load verified agent records.", error);
    return NextResponse.json(
      { ok: false, status: "unavailable", error: "Unable to load agents right now." },
      { status: 503 },
    );
  }
}
