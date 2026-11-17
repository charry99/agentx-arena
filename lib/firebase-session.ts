import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "@/lib/firebase-admin";

export const SESSION_COOKIE_NAME = "__session";

export function isInvalidFirebaseTokenError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return (
    typeof error.code === "string" &&
    [
      "auth/argument-error",
      "auth/id-token-expired",
      "auth/id-token-revoked",
      "auth/invalid-id-token",
      "auth/invalid-session-cookie",
      "auth/session-cookie-expired",
      "auth/session-cookie-revoked",
      "auth/user-disabled",
      "auth/user-not-found",
    ].includes(error.code)
  );
}

export async function verifyFirebaseSessionCookie(
  sessionCookie: string,
): Promise<DecodedIdToken | null> {
  const adminAuth = getAdminAuth();
  if (!adminAuth) {
    throw new Error("Firebase server authentication is not available.");
  }

  try {
    return await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch (error) {
    if (isInvalidFirebaseTokenError(error)) {
      return null;
    }

    throw error;
  }
}
