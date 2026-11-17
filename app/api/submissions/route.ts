import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import {
  getAdminFirestore,
  isServerFirebaseConfigured,
} from "@/lib/firebase-admin";
import { isPublicBountyRecord } from "@/lib/bounty-marketplace";
import {
  SESSION_COOKIE_NAME,
  verifyFirebaseSessionCookie,
} from "@/lib/firebase-session";
import { firestoreCollections } from "@/lib/firestore-schema";
import { isSameOriginRequest } from "@/lib/request-origin";
import { listUserSubmissions } from "@/lib/submission-store";

type SubmissionInput = {
  bountyId: string;
  repoUrl: string;
  evidenceUrl: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 2048) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function parseSubmissionInput(value: unknown): SubmissionInput | null {
  if (!isRecord(value)) return null;

  const bountyId =
    typeof value.bountyId === "string" ? value.bountyId.trim() : "";
  const repoUrl = parseHttpsUrl(value.repoUrl);
  const evidenceUrl =
    value.evidenceUrl === undefined || value.evidenceUrl === null
      ? null
      : parseHttpsUrl(value.evidenceUrl);

  if (
    bountyId.length === 0 ||
    Buffer.byteLength(bountyId, "utf8") > 1500 ||
    bountyId.includes("/") ||
    !repoUrl ||
    (value.evidenceUrl !== undefined &&
      value.evidenceUrl !== null &&
      !evidenceUrl)
  ) {
    return null;
  }

  return { bountyId, repoUrl, evidenceUrl };
}

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
  if (!sessionCookie) {
    return jsonError("Sign in to view your submissions.", 401);
  }

  let user: Awaited<ReturnType<typeof verifyFirebaseSessionCookie>>;
  try {
    user = await verifyFirebaseSessionCookie(sessionCookie);
  } catch (error) {
    console.error("Failed to verify session for submissions lookup.", error);
    return jsonError("Unable to verify the current session.", 500);
  }

  if (!user) {
    return jsonError("Your session is invalid or expired. Sign in again.", 401);
  }

  try {
    const items = await listUserSubmissions(user.uid);
    return NextResponse.json(
      { ok: true, count: items.length, items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load user submissions.", error);
    return jsonError("Unable to load your submissions right now.", 503);
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
  if (Buffer.byteLength(rawBody, "utf8") > 16_384) {
    return jsonError("The request body is too large.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError("A valid JSON body is required.", 400);
  }

  const input = parseSubmissionInput(body);
  if (!input) {
    return jsonError(
      "Provide a valid bountyId, HTTPS repository URL, and optional HTTPS evidence URL.",
      400,
    );
  }

  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return jsonError("Sign in before submitting to a bounty.", 401);
  }

  let user: Awaited<ReturnType<typeof verifyFirebaseSessionCookie>>;
  try {
    user = await verifyFirebaseSessionCookie(sessionCookie);
  } catch (error) {
    console.error("Failed to verify session for bounty submission.", error);
    return jsonError("Unable to verify the current session.", 500);
  }

  if (!user) {
    return jsonError("Your session is invalid or expired. Sign in again.", 401);
  }

  try {
    const firestore = await getAdminFirestore();
    if (!firestore) {
      return jsonError("Firebase Admin Firestore is not available.", 503);
    }

    const userRef = firestore.collection(firestoreCollections.users).doc(user.uid);
    const identityRef = firestore
      .collection(firestoreCollections.agentIdentities)
      .doc(user.uid);
    const bountyRef = firestore
      .collection(firestoreCollections.bounties)
      .doc(input.bountyId);
    const submissionId = createHash("sha256")
      .update(`${user.uid}:${input.bountyId}`)
      .digest("hex");
    const submissionRef = firestore
      .collection(firestoreCollections.submissions)
      .doc(submissionId);

    const result = await firestore.runTransaction(async (transaction) => {
      const [
        userSnapshot,
        identitySnapshot,
        bountySnapshot,
        submissionSnapshot,
      ] = await transaction.getAll(
        userRef,
        identityRef,
        bountyRef,
        submissionRef,
      );

      if (submissionSnapshot.exists) {
        return "duplicate" as const;
      }

      const profile = userSnapshot.data();
      const identity = identitySnapshot.data();
      if (
        !userSnapshot.exists ||
        profile?.role !== "agent" ||
        !identitySnapshot.exists ||
        identity?.ownerUserId !== user.uid ||
        identity.verificationStatus !== "verified" ||
        typeof identity.binanceAgentId !== "string" ||
        identity.binanceAgentId.trim().length === 0
      ) {
        return "identity-required" as const;
      }

      if (!bountySnapshot.exists) {
        return "bounty-not-found" as const;
      }

      const bounty = bountySnapshot.data();
      if (!isPublicBountyRecord(bounty)) {
        return "bounty-closed" as const;
      }

      transaction.create(submissionRef, {
        id: submissionId,
        bountyId: input.bountyId,
        userId: user.uid,
        agentId: identity.binanceAgentId,
        repoUrl: input.repoUrl,
        evidenceUrl: input.evidenceUrl,
        evaluationScore: null,
        status: "submitted",
        createdAt: FieldValue.serverTimestamp(),
      });

      return "created" as const;
    });

    if (result === "identity-required") {
      return jsonError(
        "A backend-verified Binance Agent identity is required to submit.",
        403,
      );
    }
    if (result === "bounty-not-found") {
      return jsonError("The requested bounty was not found.", 404);
    }
    if (result === "bounty-closed") {
      return jsonError("The bounty is not open, funded, and within its deadline.", 409);
    }
    if (result === "duplicate") {
      return jsonError("You have already submitted to this bounty.", 409);
    }

    return NextResponse.json(
      {
        ok: true,
        submissionId,
        status: "submitted",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to create bounty submission.", error);
    return jsonError("Unable to create the submission right now.", 500);
  }
}
