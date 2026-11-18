import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { firestoreCollections } from "@/lib/firestore-schema";

export type RoleRequestStatus = "pending" | "approved" | "rejected";

export type RoleRequestSummary = {
  userId: string;
  requestedRole: "sponsor";
  status: RoleRequestStatus;
  message: string | null;
  reviewNote: string | null;
  createdAt: string;
};

export type PendingRoleRequest = RoleRequestSummary & {
  email: string | null;
  displayName: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : undefined;
}

export function parseRoleRequest(
  userId: string,
  value: unknown,
): RoleRequestSummary | null {
  if (!isRecord(value)) return null;

  const message = nullableString(value.message);
  const reviewNote = nullableString(value.reviewNote);
  if (
    value.requestedRole !== "sponsor" ||
    (value.status !== "pending" &&
      value.status !== "approved" &&
      value.status !== "rejected") ||
    message === undefined ||
    reviewNote === undefined ||
    !(value.createdAt instanceof Timestamp)
  ) {
    return null;
  }

  return {
    userId,
    requestedRole: "sponsor",
    status: value.status,
    message,
    reviewNote,
    createdAt: value.createdAt.toDate().toISOString(),
  };
}

async function getFirestoreOrThrow() {
  const firestore = await getAdminFirestore();
  if (!firestore) {
    throw new Error("Firebase Admin Firestore is not available.");
  }
  return firestore;
}

export async function getOwnRoleRequest(
  uid: string,
): Promise<RoleRequestSummary | null> {
  const firestore = await getFirestoreOrThrow();
  const snapshot = await firestore
    .collection(firestoreCollections.roleRequests)
    .doc(uid)
    .get();
  if (!snapshot.exists) return null;

  const request = parseRoleRequest(uid, snapshot.data());
  if (!request) {
    console.warn("Skipping malformed role request record.", { userId: uid });
  }
  return request;
}

export async function listPendingRoleRequests(): Promise<PendingRoleRequest[]> {
  const firestore = await getFirestoreOrThrow();
  const snapshot = await firestore
    .collection(firestoreCollections.roleRequests)
    .where("status", "==", "pending")
    .limit(100)
    .get();

  const requests: RoleRequestSummary[] = [];
  for (const document of snapshot.docs) {
    const request = parseRoleRequest(document.id, document.data());
    if (request) {
      requests.push(request);
    } else {
      console.warn("Skipping malformed role request record.", {
        userId: document.id,
      });
    }
  }
  if (requests.length === 0) return [];

  const userRefs = requests.map((request) =>
    firestore.collection(firestoreCollections.users).doc(request.userId),
  );
  const userSnapshots = await firestore.getAll(...userRefs);

  return requests
    .map((request, index) => {
      const data = userSnapshots[index].data();
      return {
        ...request,
        email: typeof data?.email === "string" ? data.email : null,
        displayName:
          typeof data?.displayName === "string" ? data.displayName : null,
      };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
