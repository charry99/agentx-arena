import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getBinanceIdentityStatus } from "@/lib/binance-adapter";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";
import {
  SESSION_COOKIE_NAME,
  verifyFirebaseSessionCookie,
} from "@/lib/firebase-session";
import { isSameOriginRequest } from "@/lib/request-origin";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const result = getBinanceIdentityStatus();
  return jsonResponse({
    available: result.available,
    status: result.status,
    description: result.explanation,
  });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ ok: false, error: "Invalid request origin." }, 403);
  }

  if (!isServerFirebaseConfigured()) {
    return jsonResponse(
      { ok: false, error: "Firebase server authentication is not configured." },
      503,
    );
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { ok: false, error: "Content-Type must be application/json." },
      415,
    );
  }

  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return jsonResponse({ ok: false, error: "Sign in before requesting verification." }, 401);
  }

  try {
    const user = await verifyFirebaseSessionCookie(sessionCookie);
    if (!user) {
      return jsonResponse(
        { ok: false, error: "Your session is invalid or expired. Sign in again." },
        401,
      );
    }
  } catch (error) {
    console.error("Failed to verify session for Binance identity check.", error);
    return jsonResponse({ ok: false, error: "Unable to verify the current session." }, 500);
  }

  const result = getBinanceIdentityStatus();
  return jsonResponse(
    {
      ok: false,
      available: result.available,
      status: result.status,
      error: result.explanation,
    },
    503,
  );
}
