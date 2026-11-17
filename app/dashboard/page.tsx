import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  getAdminFirestore,
  isServerFirebaseConfigured,
} from "@/lib/firebase-admin";
import {
  SESSION_COOKIE_NAME,
  verifyFirebaseSessionCookie,
} from "@/lib/firebase-session";
import { firestoreCollections } from "@/lib/firestore-schema";
import {
  listUserSubmissions,
  type UserSubmission,
} from "@/lib/submission-store";
import BinanceMcpConnectionCard from "./binance-mcp-connection";
import AdminBountyReview from "./admin-bounty-review";
import SponsorBountyManager from "./sponsor-bounty-manager";

type ProfileSummary = {
  role: "agent" | "sponsor" | "admin";
};

const PROFILE_ROLES = ["agent", "sponsor", "admin"] as const;

function isProfileRole(value: unknown): value is ProfileSummary["role"] {
  return (
    typeof value === "string" &&
    PROFILE_ROLES.some((role) => role === value)
  );
}

function parseProfileSummary(data: unknown): ProfileSummary | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }

  const profile = data as Record<string, unknown>;
  if (
    !isProfileRole(profile.role)
  ) {
    return null;
  }

  return {
    role: profile.role,
  };
}

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
      <Suspense
        fallback={
          <div className="glass-panel rounded-3xl p-8 text-center text-slate-300">
            Loading your authenticated dashboard…
          </div>
        }
      >
        <AuthenticatedDashboard />
      </Suspense>
    </main>
  );
}

async function AuthenticatedDashboard() {
  if (!isServerFirebaseConfigured()) {
    redirect("/auth");
  }

  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    redirect("/auth");
  }

  await connection();
  const user = await verifyFirebaseSessionCookie(sessionCookie);
  if (!user) {
    redirect("/auth");
  }

  let profile: ProfileSummary | null = null;
  let profileStatus: "loaded" | "missing" | "unavailable" = "missing";
  try {
    const firestore = await getAdminFirestore();
    if (!firestore) {
      throw new Error("Firebase Admin Firestore is not available.");
    }

    const profileSnapshot = await firestore
      .collection(firestoreCollections.users)
      .doc(user.uid)
      .get();
    if (profileSnapshot.exists) {
      profile = parseProfileSummary(profileSnapshot.data());
      if (!profile) {
        throw new Error("The stored user profile has an invalid shape.");
      }
      profileStatus = "loaded";
    }
  } catch (error) {
    console.error("Failed to load the authenticated user's Firestore profile.", error);
    profileStatus = "unavailable";
  }

  let submissions: UserSubmission[] | null = null;
  try {
    submissions = await listUserSubmissions(user.uid);
  } catch (error) {
    console.error("Failed to load the authenticated user's submissions.", error);
  }

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-medium uppercase tracking-[0.18em] text-[#f0b90b]">
            Agent dashboard
          </div>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.05em] text-white">
            Your agent workspace
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Signed in as {user.email ?? user.name ?? "authenticated user"}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="glass-panel rounded-3xl p-6">
          <h2 className="text-lg font-bold text-white">Platform account</h2>
          {profileStatus === "loaded" && profile ? (
            <dl className="mt-5 grid gap-4 text-sm">
              <div>
                <dt className="text-slate-400">Role</dt>
                <dd className="mt-1 capitalize text-white">{profile.role}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate-300">
              {profileStatus === "missing"
                ? "No Firestore profile is linked to this account yet."
                : "The Firestore profile could not be loaded. Please try again later."}
            </p>
          )}
        </section>

        <BinanceMcpConnectionCard />

        {profileStatus === "loaded" && profile?.role === "sponsor" && (
          <SponsorBountyManager />
        )}

        {profileStatus === "loaded" && profile?.role === "admin" && (
          <AdminBountyReview />
        )}

        <section className="glass-panel rounded-3xl p-6 lg:col-span-2">
          <h2 className="text-lg font-bold text-white">Activity</h2>
          {submissions === null ? (
            <p className="mt-4 text-sm text-slate-300">
              Your submissions could not be loaded. Please try again later.
            </p>
          ) : submissions.length === 0 ? (
            <p className="mt-4 text-sm text-slate-300">
              No submissions are linked to your account yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {submissions.map((submission) => (
                <li key={submission.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white">
                      Bounty {submission.bountyId}
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-xs capitalize text-slate-300">
                      {submission.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    <a
                      href={submission.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#f0b90b] hover:underline"
                    >
                      Repository
                    </a>
                    {submission.evidenceUrl && (
                      <a
                        href={submission.evidenceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#f0b90b] hover:underline"
                      >
                        Evidence
                      </a>
                    )}
                    <span className="text-slate-400">
                      Submitted {new Date(submission.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
