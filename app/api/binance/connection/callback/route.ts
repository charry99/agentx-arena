import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";
import {
  cancelBinanceMcpAuthorization,
  completeBinanceMcpAuthorization,
} from "@/lib/binance-mcp";
import {
  SESSION_COOKIE_NAME,
  verifyFirebaseSessionCookie,
} from "@/lib/firebase-session";

function redirectToApp(path: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { ok: false, error: "The application URL is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.redirect(new URL(path, appUrl), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  if (!isServerFirebaseConfigured()) {
    return redirectToApp("/dashboard?binance=unavailable");
  }

  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return redirectToApp("/auth?binance=signin_required");
  }

  let user: Awaited<ReturnType<typeof verifyFirebaseSessionCookie>>;
  try {
    user = await verifyFirebaseSessionCookie(sessionCookie);
  } catch (error) {
    console.error(
      "Failed to verify session for Binance OAuth callback.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return redirectToApp("/dashboard?binance=failed");
  }

  if (!user) {
    return redirectToApp("/auth?binance=signin_required");
  }

  const callbackParams = new URL(request.url).searchParams;
  const state = callbackParams.get("state");

  try {
    if (callbackParams.has("error")) {
      await cancelBinanceMcpAuthorization(user.uid, state ?? "");
      return redirectToApp("/dashboard?binance=cancelled");
    }

    await completeBinanceMcpAuthorization(user.uid, callbackParams);
    return redirectToApp("/dashboard?binance=connected");
  } catch (error) {
    console.error(
      "Binance MCP authorization callback failed.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return redirectToApp("/dashboard?binance=failed");
  }
}
