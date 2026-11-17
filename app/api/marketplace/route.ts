import { NextResponse } from "next/server";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";
import { listPublicBounties } from "@/lib/bounty-marketplace";

export async function GET() {
  if (!isServerFirebaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        status: "not-configured",
        error: "Firebase server credentials are required to load live bounties.",
      },
      { status: 503 },
    );
  }

  try {
    const items = await listPublicBounties();
    return NextResponse.json({
      ok: true,
      count: items.length,
      items,
      status: items.length > 0 ? "live" : "no-live-bounties",
      message:
        items.length > 0
          ? "Showing published, funded bounties."
          : "No open, funded bounties are currently available.",
    });
  } catch (error) {
    console.error("Failed to load public bounties.", error);
    return NextResponse.json(
      { ok: false, status: "unavailable", error: "Unable to load bounties right now." },
      { status: 503 },
    );
  }
}
