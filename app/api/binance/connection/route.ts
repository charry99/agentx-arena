import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isServerFirebaseConfigured } from "@/lib/firebase-admin";
import {
  beginBinanceMcpAuthorization,
  disconnectBinanceMcp,
  getBinanceMcpConnectionSummary,
} from "@/lib/binance-mcp";
import {
  SESSION_COOKIE_NAME,
  verifyFirebaseSessionCookie,
} from "@/lib/firebase-session";
import { isSameOriginRequest } from "@/lib/request-origin";

type AuthResult =
  | { uid: string; response?: never }
  | { uid?: never; response: NextResponse };

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function getAuthenticatedUser(): Promise<AuthResult> {
  if (!isServerFirebaseConfigured()) {
    return {
      response: jsonResponse(
        { ok: false, error: "Firebase server authentication is not configured." },
        503,
      ),
    };
  }

  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return {
      response: jsonResponse({ ok: false, error: "Sign in to manage your Binance connection." }, 401),
    };
  }

  try {
    const user = await verifyFirebaseSessionCookie(sessionCookie);
    if (!user) {
      return {
        response: jsonResponse(
          { ok: false, error: "Your session is invalid or expired. Sign in again." },
          401,
        ),
      };
    }

    return { uid: user.uid };
  } catch (error) {
    console.error(
      "Failed to verify session for Binance MCP connection.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return {
      response: jsonResponse(
        { ok: false, error: "Unable to verify the current session." },
        500,
      ),
    };
  }
}

export async function GET() {
  const auth = await getAuthenticatedUser();
  if (auth.response) return auth.response;

  try {
    const connection = await getBinanceMcpConnectionSummary(auth.uid);
    return jsonResponse({ ok: true, connection });
  } catch (error) {
    console.error(
      "Failed to load Binance MCP connection status.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return jsonResponse(
      { ok: false, error: "Unable to load Binance connection status." },
      503,
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ ok: false, error: "Invalid request origin." }, 403);
  }

  const auth = await getAuthenticatedUser();
  if (auth.response) return auth.response;

  try {
    const authorizationUrl = await beginBinanceMcpAuthorization(auth.uid);
    return jsonResponse({ ok: true, authorizationUrl });
  } catch (error) {
    const conflictMessage =
      error instanceof Error &&
      [
        "A Binance MCP connection is already active. Disconnect it first.",
        "A Binance authorization is already pending for this account.",
      ].includes(error.message)
        ? error.message
        : null;
    console.error(
      "Failed to start Binance MCP authorization.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return jsonResponse(
      {
        ok: false,
        error:
          conflictMessage ??
          "Unable to start Binance authorization. Check server configuration and try again.",
      },
      conflictMessage ? 409 : 503,
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ ok: false, error: "Invalid request origin." }, 403);
  }

  const auth = await getAuthenticatedUser();
  if (auth.response) return auth.response;

  try {
    await disconnectBinanceMcp(auth.uid);
    const connection = await getBinanceMcpConnectionSummary(auth.uid);
    return jsonResponse({ ok: true, connection });
  } catch (error) {
    console.error(
      "Failed to disconnect Binance MCP.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return jsonResponse(
      { ok: false, error: "Unable to clear the Binance connection." },
      503,
    );
  }
}
