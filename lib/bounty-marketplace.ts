import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { firestoreCollections } from "@/lib/firestore-schema";

const MAX_PUBLIC_BOUNTIES = 100;

export type PublicBounty = {
  id: string;
  title: string;
  description: string;
  category: string;
  rewardAmount: number;
  currency: "USDC";
  submissionDeadline: string;
  createdAt: string;
  eligibility?: string[];
  evaluationCriteria?: string[];
};

type PublicBountyDocument = {
  status: "open";
  fundingStatus: "funded";
  title: string;
  description: string;
  category: string;
  rewardAmount: number;
  currency: "USDC";
  submissionDeadline: Timestamp;
  createdAt: Timestamp;
  eligibility?: unknown;
  evaluationCriteria?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isPublicBountyRecord(
  value: unknown,
  now = Date.now(),
): value is PublicBountyDocument {
  if (!isRecord(value)) return false;

  const deadline = value.submissionDeadline;
  const createdAt = value.createdAt;

  return (
    value.status === "open" &&
    value.fundingStatus === "funded" &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    typeof value.description === "string" &&
    value.description.trim().length > 0 &&
    typeof value.category === "string" &&
    value.category.trim().length > 0 &&
    typeof value.rewardAmount === "number" &&
    Number.isFinite(value.rewardAmount) &&
    value.rewardAmount > 0 &&
    value.currency === "USDC" &&
    deadline instanceof Timestamp &&
    createdAt instanceof Timestamp &&
    deadline.toMillis() > now
  );
}

function parsePublicBounty(
  id: string,
  data: unknown,
  now: number,
): PublicBounty | null {
  if (!isPublicBountyRecord(data, now)) return null;

  return {
    id,
    title: data.title,
    description: data.description,
    category: data.category,
    rewardAmount: data.rewardAmount,
    currency: "USDC",
    submissionDeadline: data.submissionDeadline.toDate().toISOString(),
    createdAt: data.createdAt.toDate().toISOString(),
    ...(isStringArray(data.eligibility) ? { eligibility: data.eligibility } : {}),
    ...(isStringArray(data.evaluationCriteria)
      ? { evaluationCriteria: data.evaluationCriteria }
      : {}),
  };
}

export async function listPublicBounties(): Promise<PublicBounty[]> {
  const firestore = await getAdminFirestore();
  if (!firestore) {
    throw new Error("Firebase Admin Firestore is not configured.");
  }

  const snapshot = await firestore
    .collection(firestoreCollections.bounties)
    .where("status", "==", "open")
    .where("fundingStatus", "==", "funded")
    .limit(MAX_PUBLIC_BOUNTIES)
    .get();
  const now = Date.now();
  const items: PublicBounty[] = [];

  for (const document of snapshot.docs) {
    const data: unknown = document.data();
    const bounty = parsePublicBounty(document.id, data, now);
    if (bounty) {
      items.push(bounty);
    } else {
      console.warn("Skipping malformed or expired public bounty record.", {
        bountyId: document.id,
      });
    }
  }

  return items.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}
