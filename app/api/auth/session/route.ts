import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import {
  getAdminAuth,
  getAdminFirestore,
  isServerFirebaseConfigured,
} from "@/lib/firebase-admin";
import { firestoreCollections } from "@/lib/firestore-schema";
import {
  isInvalidFirebaseTokenError,
  SESSION_COOKIE_NAME,
  verifyFirebaseSessionCookie,
} from "@/lib/firebase-session";
import { isSameOriginRequest } from "@/lib/request-origin";

const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000;

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  };
}

function sessionResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const serverConfigured = isServerFirebaseConfigured();
  const clientConfigured = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET &&
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );

  if (!serverConfigured) {
    return sessionResponse({
      authenticated: false,
      configured: false,
      clientConfigured,
      serverConfigured,
      status: "not-configured",
      user: null,
    });
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return sessionResponse({
      authenticated: false,
      configured: clientConfigured,
      clientConfigured,
      serverConfigured,
      status: "signed-out",
      user: null,
    });
  }

  try {
    const decoded = await verifyFirebaseSessionCookie(sessionCookie);
    if (!decoded) {
      const response = sessionResponse({
        authenticated: false,
        configured: clientConfigured,
        clientConfigured,
        serverConfigured,
        status: "signed-out",
        user: null,
      });
      response.cookies.set(SESSION_COOKIE_NAME, "", {
        ...sessionCookieOptions(),
        maxAge: 0,
      });
      return response;
    }

    return sessionResponse({
      authenticated: true,
      configured: clientConfigured,
      clientConfigured,
      serverConfigured,
      status: "signed-in",
      user: {
        uid: decoded.uid,
        email: decoded.email ?? null,
        displayName: decoded.name ?? null,
        photoURL: decoded.picture ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to verify Firebase session cookie.", error);
    return sessionResponse({ error: "Unable to verify the current session." }, 500);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return sessionResponse({ error: "Invalid request origin." }, 403);
  }

  if (!isServerFirebaseConfigured()) {
    return sessionResponse({ error: "Firebase server authentication is not configured." }, 503);
  }

  let idToken: unknown;
  try {
    const body: unknown = await request.json();
    idToken =
      typeof body === "object" && body !== null && "idToken" in body
        ? body.idToken
        : undefined;
  } catch {
    return sessionResponse({ error: "A valid JSON body is required." }, 400);
  }

  if (typeof idToken !== "string" || idToken.length === 0) {
    return sessionResponse({ error: "A Firebase ID token is required." }, 400);
  }

  const adminAuth = getAdminAuth();
  const db = await getAdminFirestore();
  if (!adminAuth || !db) {
    return sessionResponse(
      { error: "Firebase server authentication is not available." },
      503,
    );
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    });
    const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const isConfiguredAdmin =
      decoded.email_verified === true &&
      Boolean(configuredAdminEmail) &&
      decoded.email?.toLowerCase() === configuredAdminEmail;
    const userRef = db.collection(firestoreCollections.users).doc(decoded.uid);
    const userProfile = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      displayName: decoded.name ?? null,
      photoURL: decoded.picture ?? null,
    };

    await db.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      if (userSnapshot.exists) {
        transaction.update(userRef, {
          ...userProfile,
          ...(isConfiguredAdmin ? { role: "admin" } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      transaction.create(userRef, {
        ...userProfile,
        role: isConfiguredAdmin ? "admin" : "agent",
        reputationScore: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const response = sessionResponse({
      authenticated: true,
      status: "signed-in",
      user: userProfile,
    });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, sessionCookieOptions());
    return response;
  } catch (error) {
    if (isInvalidFirebaseTokenError(error)) {
      return sessionResponse({ error: "The Firebase sign-in token is invalid or expired." }, 401);
    }

    console.error("Failed to create Firebase session.", error);
    return sessionResponse({ error: "Unable to create the authenticated session." }, 500);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return sessionResponse({ error: "Invalid request origin." }, 403);
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return sessionResponse({ authenticated: false, status: "signed-out" });
}
