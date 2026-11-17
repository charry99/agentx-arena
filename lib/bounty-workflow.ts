import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { firestoreCollections } from "@/lib/firestore-schema";

export type BountyReviewStatus = "pending" | "approved" | "rejected";

export type ManagedBounty = {
  id: string;
  title: string;
  description: string;
  category: string;
  rewardAmount: number;
  currency: "USDC";
  status: "draft";
  fundingStatus: "unfunded";
  reviewStatus: BountyReviewStatus;
  reviewNote: string | null;
  submissionDeadline: string;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseManagedBounty(id: string, value: unknown): ManagedBounty | null {
  if (!isRecord(value)) return null;

  const {
    title,
    description,
    category,
    rewardAmount,
    currency,
    status,
    fundingStatus,
    reviewStatus,
    reviewNote,
    submissionDeadline,
    createdAt,
  } = value;

  if (
    typeof title !== "string" ||
    title.trim().length === 0 ||
    typeof description !== "string" ||
    description.trim().length === 0 ||
    typeof category !== "string" ||
    category.trim().length === 0 ||
    typeof rewardAmount !== "number" ||
    !Number.isFinite(rewardAmount) ||
    rewardAmount <= 0 ||
    currency !== "USDC" ||
    status !== "draft" ||
    fundingStatus !== "unfunded" ||
    (reviewStatus !== "pending" &&
      reviewStatus !== "approved" &&
      reviewStatus !== "rejected") ||
    (reviewNote !== null && typeof reviewNote !== "string") ||
    !(submissionDeadline instanceof Timestamp) ||
    !(createdAt instanceof Timestamp)
  ) {
    return null;
  }

  return {
    id,
    title,
    description,
    category,
    rewardAmount,
    currency: "USDC",
    status: "draft",
    fundingStatus: "unfunded",
    reviewStatus,
    reviewNote,
    submissionDeadline: submissionDeadline.toDate().toISOString(),
    createdAt: createdAt.toDate().toISOString(),
  };
}

async function getBountiesCollection() {
  const firestore = await getAdminFirestore();
  if (!firestore) {
    throw new Error("Firebase Admin Firestore is not available.");
  }

  return firestore.collection(firestoreCollections.bounties);
}

async function parseBountySnapshot(snapshot: FirebaseFirestore.QuerySnapshot) {
  const items: ManagedBounty[] = [];

  for (const document of snapshot.docs) {
    const bounty = parseManagedBounty(document.id, document.data());
    if (bounty) {
      items.push(bounty);
    } else {
      console.warn("Skipping malformed sponsor bounty record.", {
        bountyId: document.id,
      });
    }
  }

  return items.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function listSponsorBounties(sponsorId: string): Promise<ManagedBounty[]> {
  const collection = await getBountiesCollection();
  const snapshot = await collection
    .where("sponsorId", "==", sponsorId)
    .limit(50)
    .get();

  return parseBountySnapshot(snapshot);
}

export async function listPendingBountyReviews(): Promise<ManagedBounty[]> {
  const collection = await getBountiesCollection();
  const snapshot = await collection
    .where("reviewStatus", "==", "pending")
    .limit(100)
    .get();

  return parseBountySnapshot(snapshot);
}
