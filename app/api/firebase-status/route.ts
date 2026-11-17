import { NextResponse } from "next/server";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";

export async function GET() {
  const configured = isServerFirebaseConfigured();

  return NextResponse.json({
    ok: true,
    configured,
    mode: configured ? "firebase-enabled" : "not-configured",
    storage: configured ? "Firestore-enabled" : "not-configured",
    auth: configured ? "Google Auth and server sessions enabled" : "not-configured",
  });
}
