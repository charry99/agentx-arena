import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { firestoreCollections } from "@/lib/firestore-schema";

const MAX_USER_SUBMISSIONS = 100;
const SUBMISSION_STATUSES = [
  "submitted",
  "queued",
  "approved",
  "rejected",
] as const;

export type UserSubmission = {
  id: string;
  bountyId: string;
  repoUrl: string;
  evidenceUrl: string | null;
  evaluationScore: number | null;
  status: (typeof SUBMISSION_STATUSES)[number];
  createdAt: string;
};

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSubmissionStatus(
  value: unknown,
): value is UserSubmission["status"] {
  return (
    typeof value === "string" &&
    SUBMISSION_STATUSES.some((status) => status === value)
  );
}

export async function listUserSubmissions(
  userId: string,
): Promise<UserSubmission[]> {
  const firestore = await getAdminFirestore();
  if (!firestore) {
    throw new Error("Firebase Admin Firestore is not configured.");
  }

  const snapshot = await firestore
    .collection(firestoreCollections.submissions)
    .where("userId", "==", userId)
    .limit(MAX_USER_SUBMISSIONS)
    .get();
  const submissions: UserSubmission[] = [];

  for (const document of snapshot.docs) {
    const data = document.data();
    const evidenceUrl = data.evidenceUrl;
    const evaluationScore = data.evaluationScore;
    const createdAt = data.createdAt;

    if (
      typeof data.bountyId !== "string" ||
      data.bountyId.length === 0 ||
      !isHttpsUrl(data.repoUrl) ||
      (evidenceUrl !== null && !isHttpsUrl(evidenceUrl)) ||
      (evaluationScore !== null &&
        (typeof evaluationScore !== "number" ||
          !Number.isFinite(evaluationScore))) ||
      !isSubmissionStatus(data.status) ||
      !(createdAt instanceof Timestamp)
    ) {
      console.warn("Skipping malformed user submission record.", {
        submissionId: document.id,
      });
      continue;
    }

    submissions.push({
      id: document.id,
      bountyId: data.bountyId,
      repoUrl: data.repoUrl,
      evidenceUrl,
      evaluationScore,
      status: data.status,
      createdAt: createdAt.toDate().toISOString(),
    });
  }

  return submissions.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}
