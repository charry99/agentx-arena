import "server-only";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { firestoreCollections } from "@/lib/firestore-schema";
import { verifyFirebaseSessionCookie } from "@/lib/firebase-session";

export type PlatformRole = "agent" | "sponsor" | "admin";

export type AuthenticatedPlatformUser = {
  uid: string;
  role: PlatformRole;
};

function isPlatformRole(value: unknown): value is PlatformRole {
  return value === "agent" || value === "sponsor" || value === "admin";
}

export async function getAuthenticatedPlatformUser(
  sessionCookie: string | undefined,
): Promise<AuthenticatedPlatformUser | null> {
  if (!sessionCookie) return null;

  const user = await verifyFirebaseSessionCookie(sessionCookie);
  if (!user) return null;

  const firestore = await getAdminFirestore();
  if (!firestore) {
    throw new Error("Firebase Admin Firestore is not available.");
  }

  const profileSnapshot = await firestore
    .collection(firestoreCollections.users)
    .doc(user.uid)
    .get();
  const role: unknown = profileSnapshot.data()?.role;

  if (!profileSnapshot.exists || !isPlatformRole(role)) {
    return null;
  }

  return { uid: user.uid, role };
}
