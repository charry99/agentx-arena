import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import {
  getAdminFirestore,
  isServerFirebaseConfigured,
} from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME } from "@/lib/firebase-session";
import { firestoreCollections } from "@/lib/firestore-schema";
import { getAuthenticatedPlatformUser } from "@/lib/platform-role";
import { isSameOriginRequest } from "@/lib/request-origin";
import { getOwnRoleRequest } from "@/lib/role-requests";

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function authenticate() {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return getAuthenticatedPlatformUser(sessionCookie);
}

export async function GET() {
  if (!isServerFirebaseConfigured()) {
    return jsonError("Firebase server authentication is not configured.", 503);
  }

  try {
    const user = await authenticate();
    if (!user) return jsonError("Sign in to view your access request.", 401);

    const request = await getOwnRoleRequest(user.uid);
    return NextResponse.json(
      { ok: true, role: user.role, request },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load the role request.", error);
    return jsonError("Unable to load your access request right now.", 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonError("Invalid request origin.", 403);
  }
  if (!isServerFirebaseConfigured()) {
    return jsonError("Firebase server authentication is not configured.", 503);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonError("Content-Type must be application/json.", 415);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError("Unable to read the request body.", 400);
  }
  if (Buffer.byteLength(rawBody, "utf8") > 2_048) {
    return jsonError("The request body is too large.", 413);
  }

  let message: string | null = null;
  try {
    const body: unknown = JSON.parse(rawBody);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return jsonError("A valid JSON body is required.", 400);
    }
    const value = (body as Record<string, unknown>).message;
    if (value !== undefined && typeof value !== "string") {
      return jsonError("The message must be text.", 400);
    }
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed.length > 500) {
      return jsonError("The message must be 500 characters or fewer.", 400);
    }
    message = trimmed || null;
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  let user: Awaited<ReturnType<typeof authenticate>>;
  try {
    user = await authenticate();
  } catch (error) {
    console.error("Failed to authenticate the role request.", error);
    return jsonError("Unable to verify the current session.", 500);
  }
  if (!user) return jsonError("Sign in to request sponsor access.", 401);
  if (user.role !== "agent") {
    return jsonError("Only agent accounts can request sponsor access.", 403);
  }

  try {
    const firestore = await getAdminFirestore();
    if (!firestore) {
      return jsonError("Firebase Admin Firestore is not available.", 503);
    }

    const userRef = firestore.collection(firestoreCollections.users).doc(user.uid);
    const requestRef = firestore
      .collection(firestoreCollections.roleRequests)
      .doc(user.uid);

    const result = await firestore.runTransaction(async (transaction) => {
      const [profile, existing] = await transaction.getAll(userRef, requestRef);
      if (!profile.exists || profile.data()?.role !== "agent") {
        return "forbidden" as const;
      }
      if (existing.exists && existing.data()?.status === "pending") {
        return "pending" as const;
      }

      transaction.set(requestRef, {
        userId: user.uid,
        requestedRole: "sponsor",
        status: "pending",
        message,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "created" as const;
    });

    if (result === "forbidden") {
      return jsonError("Only agent accounts can request sponsor access.", 403);
    }
    if (result === "pending") {
      return jsonError("You already have a pending sponsor access request.", 409);
    }

    return NextResponse.json(
      { ok: true, status: "pending" },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to create the role request.", error);
    return jsonError("Unable to submit your request right now.", 500);
  }
}
