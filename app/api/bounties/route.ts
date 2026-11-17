import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { cookies } from "next/headers";
import {
  getAdminFirestore,
  isServerFirebaseConfigured,
} from "@/lib/firebase-admin";
import { listPublicBounties } from "@/lib/bounty-marketplace";
import { categories } from "@/lib/mock-data";
import { getAuthenticatedPlatformUser } from "@/lib/platform-role";
import { firestoreCollections } from "@/lib/firestore-schema";
import { SESSION_COOKIE_NAME } from "@/lib/firebase-session";
import { isSameOriginRequest } from "@/lib/request-origin";

type SponsorBountyInput = {
  title: string;
  description: string;
  category: string;
  rewardAmount: number;
  submissionDeadline: Date;
  eligibility: string[];
  evaluationCriteria: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) return null;

  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 240) return null;
    result.push(trimmed);
  }

  return result;
}

function parseSponsorBountyInput(value: unknown): SponsorBountyInput | null {
  if (!isRecord(value)) return null;

  const title = typeof value.title === "string" ? value.title.trim() : "";
  const description =
    typeof value.description === "string" ? value.description.trim() : "";
  const category = typeof value.category === "string" ? value.category.trim() : "";
  const rewardAmount =
    typeof value.rewardAmount === "number" ? value.rewardAmount : Number.NaN;
  const deadlineValue =
    typeof value.submissionDeadline === "string"
      ? value.submissionDeadline
      : "";
  const deadlineMilliseconds = Date.parse(deadlineValue);
  const eligibility = parseStringList(value.eligibility);
  const evaluationCriteria = parseStringList(value.evaluationCriteria);

  if (
    title.length === 0 ||
    title.length > 120 ||
    description.length === 0 ||
    description.length > 10_000 ||
    !categories.includes(category) ||
    !Number.isFinite(rewardAmount) ||
    rewardAmount <= 0 ||
    rewardAmount > Number.MAX_SAFE_INTEGER ||
    !deadlineValue ||
    !Number.isFinite(deadlineMilliseconds) ||
    deadlineMilliseconds <= Date.now() ||
    eligibility === null ||
    evaluationCriteria === null
  ) {
    return null;
  }

  return {
    title,
    description,
    category,
    rewardAmount,
    submissionDeadline: new Date(deadlineMilliseconds),
    eligibility,
    evaluationCriteria,
  };
}

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  if (!isServerFirebaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        status: "not-configured",
        error: "Firebase server credentials are required to load live bounties.",
      },
      { status: 503 },
    );
  }

  try {
    const items = await listPublicBounties();
    return NextResponse.json({
      ok: true,
      count: items.length,
      items,
      status: items.length > 0 ? "live" : "no-live-bounties",
      message:
        items.length > 0
          ? "Showing published, funded bounties."
          : "No open, funded bounties are currently available.",
    });
  } catch (error) {
    console.error("Failed to load public bounties.", error);
    return NextResponse.json(
      { ok: false, status: "unavailable", error: "Unable to load bounties right now." },
      { status: 503 },
    );
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

  const input = parseSponsorBountyInput(body);
  if (!input) {
    return jsonError(
      "Provide a title, description, supported category, positive USDC reward, future deadline, and valid criteria.",
      400,
    );
  }

  let user: Awaited<ReturnType<typeof getAuthenticatedPlatformUser>>;
  try {
    const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    user = await getAuthenticatedPlatformUser(sessionCookie);
  } catch (error) {
    console.error("Failed to authenticate sponsor bounty creation.", error);
    return jsonError("Unable to verify the current session.", 500);
  }
  if (!user) {
    return jsonError("Sign in to create a bounty draft.", 401);
  }
  if (user.role !== "sponsor") {
    return jsonError("A sponsor account is required to create bounty drafts.", 403);
  }

  try {
    const firestore = await getAdminFirestore();
    if (!firestore) {
      return jsonError("Firebase Admin Firestore is not available.", 503);
    }

    const bountyId = randomUUID();
    const userRef = firestore.collection(firestoreCollections.users).doc(user.uid);
    const bountyRef = firestore.collection(firestoreCollections.bounties).doc(bountyId);
    const created = await firestore.runTransaction(async (transaction) => {
      const profile = await transaction.get(userRef);
      if (!profile.exists || profile.data()?.role !== "sponsor") {
        return false;
      }

      transaction.create(bountyRef, {
        id: bountyId,
        ...input,
        submissionDeadline: Timestamp.fromDate(input.submissionDeadline),
        currency: "USDC",
        sponsorId: user.uid,
        status: "draft",
        fundingStatus: "unfunded",
        reviewStatus: "pending",
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (!created) {
      return jsonError("Sponsor access is no longer available for this account.", 403);
    }

    return NextResponse.json(
      {
        ok: true,
        bounty: {
          id: bountyId,
          status: "draft",
          fundingStatus: "unfunded",
          reviewStatus: "pending",
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to create sponsor bounty draft.", error);
    return jsonError("Unable to create the bounty draft right now.", 500);
  }
}
