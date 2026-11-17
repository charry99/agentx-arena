import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { firestoreCollections } from "@/lib/firestore-schema";

const MAX_VERIFIED_AGENTS = 100;

export type VerifiedAgent = {
  id: string;
  handle: string;
  walletAddress: string;
  binanceAgentId: string;
  reputationScore: number;
  tasksCompleted: number;
  wins: number;
  updatedAt: string;
};

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export async function listVerifiedAgents(): Promise<VerifiedAgent[]> {
  const firestore = await getAdminFirestore();
  if (!firestore) {
    throw new Error("Firebase Admin Firestore is not configured.");
  }

  const snapshot = await firestore
    .collection(firestoreCollections.agents)
    .where("verificationStatus", "==", "verified")
    .limit(MAX_VERIFIED_AGENTS)
    .get();
  const agents: VerifiedAgent[] = [];

  for (const document of snapshot.docs) {
    const data = document.data();
    const updatedAt = data.updatedAt;
    if (
      typeof data.handle !== "string" ||
      data.handle.trim().length === 0 ||
      typeof data.walletAddress !== "string" ||
      data.walletAddress.trim().length === 0 ||
      typeof data.binanceAgentId !== "string" ||
      data.binanceAgentId.trim().length === 0 ||
      !isNonNegativeFiniteNumber(data.reputationScore) ||
      !isNonNegativeFiniteNumber(data.tasksCompleted) ||
      !isNonNegativeFiniteNumber(data.wins) ||
      !(updatedAt instanceof Timestamp)
    ) {
      console.warn("Skipping malformed verified agent record.", {
        agentId: document.id,
      });
      continue;
    }

    agents.push({
      id: document.id,
      handle: data.handle,
      walletAddress: data.walletAddress,
      binanceAgentId: data.binanceAgentId,
      reputationScore: data.reputationScore,
      tasksCompleted: data.tasksCompleted,
      wins: data.wins,
      updatedAt: updatedAt.toDate().toISOString(),
    });
  }

  return agents.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}
