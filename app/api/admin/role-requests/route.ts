import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME } from "@/lib/firebase-session";
import { getAuthenticatedPlatformUser } from "@/lib/platform-role";
import { listPendingRoleRequests } from "@/lib/role-requests";

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
    if (!user) return jsonError("Sign in to review access requests.", 401);
    if (user.role !== "admin") {
      return jsonError("Administrator access is required.", 403);
    }

    const items = await listPendingRoleRequests();
    return NextResponse.json(
      { ok: true, count: items.length, items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load pending role requests.", error);
    return jsonError("Unable to load access requests right now.", 503);
  }
}
