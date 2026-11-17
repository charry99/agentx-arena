import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import {
  getAdminFirestore,
  isServerFirebaseConfigured,
} from "@/lib/firebase-admin";
import { firestoreCollections } from "@/lib/firestore-schema";
import { SESSION_COOKIE_NAME } from "@/lib/firebase-session";
import { getAuthenticatedPlatformUser } from "@/lib/platform-role";
import { isSameOriginRequest } from "@/lib/request-origin";

type ReviewInput = {
  decision: "approve" | "reject";
  note: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReviewInput(value: unknown): ReviewInput | null {
  if (!isRecord(value)) return null;

  const decision = value.decision;
  const noteValue = value.note;
  if (decision !== "approve" && decision !== "reject") return null;
  if (noteValue !== undefined && typeof noteValue !== "string") return null;

  const note = typeof noteValue === "string" ? noteValue.trim() : "";
  if (note.length > 500) return null;

  return { decision, note: note || null };
}

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ bountyId: string }> },
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

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  const input = parseReviewInput(body);
  if (!input) {
    return jsonError("Provide an approve or reject decision and an optional short note.", 400);
  }

  let bountyId: string;
  try {
    bountyId = (await params).bountyId;
  } catch {
    return jsonError("A valid bounty ID is required.", 400);
  }
  if (!bountyId || bountyId.includes("/") || Buffer.byteLength(bountyId, "utf8") > 1500) {
    return jsonError("A valid bounty ID is required.", 400);
  }

  let user: Awaited<ReturnType<typeof getAuthenticatedPlatformUser>>;
  try {
    const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    user = await getAuthenticatedPlatformUser(sessionCookie);
  } catch (error) {
    console.error("Failed to authenticate bounty review.", error);
    return jsonError("Unable to verify the current session.", 500);
  }
  if (!user) {
    return jsonError("Sign in to review bounty drafts.", 401);
  }
  if (user.role !== "admin") {
    return jsonError("Administrator access is required to review bounty drafts.", 403);
  }

  try {
    const firestore = await getAdminFirestore();
    if (!firestore) {
      return jsonError("Firebase Admin Firestore is not available.", 503);
    }

    const userRef = firestore.collection(firestoreCollections.users).doc(user.uid);
    const bountyRef = firestore.collection(firestoreCollections.bounties).doc(bountyId);
    const result = await firestore.runTransaction(async (transaction) => {
      const [profileSnapshot, bountySnapshot] = await transaction.getAll(
        userRef,
        bountyRef,
      );
      if (!profileSnapshot.exists || profileSnapshot.data()?.role !== "admin") {
        return "forbidden" as const;
      }
      if (!bountySnapshot.exists) {
        return "not-found" as const;
      }

      const bounty = bountySnapshot.data();
      if (
        bounty?.status !== "draft" ||
        bounty.fundingStatus !== "unfunded" ||
        bounty.reviewStatus !== "pending"
      ) {
        return "not-reviewable" as const;
      }

      transaction.update(bountyRef, {
        reviewStatus: input.decision === "approve" ? "approved" : "rejected",
        reviewedBy: user.uid,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewNote: input.note,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "updated" as const;
    });

    if (result === "forbidden") {
      return jsonError("Administrator access is no longer available for this account.", 403);
    }
    if (result === "not-found") {
      return jsonError("The bounty draft was not found.", 404);
    }
    if (result === "not-reviewable") {
      return jsonError("This bounty draft is no longer awaiting review.", 409);
    }

    return NextResponse.json(
      {
        ok: true,
        reviewStatus: input.decision === "approve" ? "approved" : "rejected",
        published: false,
        funded: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to review bounty draft.", error);
    return jsonError("Unable to review the bounty draft right now.", 500);
  }
}
