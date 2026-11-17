import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";
import { listSponsorBounties } from "@/lib/bounty-workflow";
import { SESSION_COOKIE_NAME } from "@/lib/firebase-session";
import { getAuthenticatedPlatformUser } from "@/lib/platform-role";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  if (!isServerFirebaseConfigured()) {
    return jsonError("Firebase server authentication is not configured.", 503);
  }

  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  try {
    const user = await getAuthenticatedPlatformUser(sessionCookie);
    if (!user) {
      return jsonError("Sign in to view sponsor bounty drafts.", 401);
    }
    if (user.role !== "sponsor") {
      return jsonError("A sponsor account is required to view bounty drafts.", 403);
    }

    const items = await listSponsorBounties(user.uid);
    return NextResponse.json(
      { ok: true, count: items.length, items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load sponsor bounty drafts.", error);
    return jsonError("Unable to load sponsor bounty drafts right now.", 503);
  }
}
