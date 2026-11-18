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

type ReviewInput = { decision: "approve" | "reject"; note: string | null };

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function parseReviewInput(value: unknown): ReviewInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const { decision, note: noteValue } = value as Record<string, unknown>;
  if (decision !== "approve" && decision !== "reject") return null;
  if (noteValue !== undefined && typeof noteValue !== "string") return null;

  const note = typeof noteValue === "string" ? noteValue.trim() : "";
  if (note.length > 500) return null;
  return { decision, note: note || null };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
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

  let input: ReviewInput | null;
  try {
    input = parseReviewInput(JSON.parse(rawBody));
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }
  if (!input) {
    return jsonError("Provide an approve or reject decision and an optional short note.", 400);
  }

  const { userId } = await params;
  if (!userId || userId.includes("/") || Buffer.byteLength(userId, "utf8") > 1500) {
    return jsonError("A valid user ID is required.", 400);
  }

  let admin: Awaited<ReturnType<typeof getAuthenticatedPlatformUser>>;
  try {
    const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    admin = await getAuthenticatedPlatformUser(sessionCookie);
  } catch (error) {
    console.error("Failed to authenticate role request review.", error);
    return jsonError("Unable to verify the current session.", 500);
  }
  if (!admin) return jsonError("Sign in to review access requests.", 401);
  if (admin.role !== "admin") {
    return jsonError("Administrator access is required.", 403);
  }

  try {
    const firestore = await getAdminFirestore();
    if (!firestore) {
      return jsonError("Firebase Admin Firestore is not available.", 503);
    }

    const adminRef = firestore.collection(firestoreCollections.users).doc(admin.uid);
    const targetRef = firestore.collection(firestoreCollections.users).doc(userId);
    const requestRef = firestore.collection(firestoreCollections.roleRequests).doc(userId);

    const result = await firestore.runTransaction(async (transaction) => {
      const [adminProfile, target, roleRequest] = await transaction.getAll(
        adminRef,
        targetRef,
        requestRef,
      );
      if (!adminProfile.exists || adminProfile.data()?.role !== "admin") {
        return "forbidden" as const;
      }
      if (!roleRequest.exists) return "not-found" as const;

      const data = roleRequest.data();
      if (data?.status !== "pending" || data.requestedRole !== "sponsor") {
        return "not-reviewable" as const;
      }

      if (input.decision === "approve") {
        if (!target.exists || target.data()?.role !== "agent") {
          return "role-changed" as const;
        }
        transaction.update(targetRef, {
          role: "sponsor",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      transaction.update(requestRef, {
        status: input.decision === "approve" ? "approved" : "rejected",
        reviewedBy: admin.uid,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewNote: input.note,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "updated" as const;
    });

    if (result === "forbidden") {
      return jsonError("Administrator access is no longer available for this account.", 403);
    }
    if (result === "not-found") return jsonError("The access request was not found.", 404);
    if (result === "not-reviewable") {
      return jsonError("This request is no longer awaiting review.", 409);
    }
    if (result === "role-changed") {
      return jsonError("The user is no longer an agent account, so the role cannot be changed.", 409);
    }

    return NextResponse.json(
      { ok: true, status: input.decision === "approve" ? "approved" : "rejected" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to review the role request.", error);
    return jsonError("Unable to review the request right now.", 500);
  }
}
