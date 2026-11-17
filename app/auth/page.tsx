"use client";

import { useEffect, useState } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "@/lib/firebase-client";

type SessionUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

export default function AuthPage() {
  const [status, setStatus] = useState("Checking authentication configuration...");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Unable to load the current session.");
        }

        if (active) {
          setAuthConfigured(Boolean(result.serverConfigured && result.clientConfigured));
          setUser(result.authenticated ? result.user : null);
          setStatus(
            result.serverConfigured && result.clientConfigured
              ? result.authenticated
                ? "Authenticated session is active."
                : "Ready to authenticate."
              : !result.clientConfigured
                ? "Firebase client configuration is not complete."
                : "Firebase server credentials are not configured yet.",
          );
        }
      } catch (error) {
        if (active) {
          setStatus(error instanceof Error ? error.message : "Unable to load the current session.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  const handleGoogleSignIn = async () => {
    if (!auth) {
      setStatus("Add Firebase client environment variables to enable Google sign-in.");
      return;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const session = await response.json();
      if (!response.ok) {
        throw new Error(session.error ?? "Unable to establish the server session.");
      }

      setUser(session.user);
      setStatus("Authentication successful. Your server session is active.");
    } catch (error) {
      let message = error instanceof Error ? error.message : "Sign-in failed.";
      if (auth.currentUser) {
        try {
          await signOut(auth);
        } catch (cleanupError) {
          console.error("Failed to clear the browser Firebase sign-in.", cleanupError);
          message += " The browser sign-in could not be cleared; sign out and retry.";
        }
      }
      setUser(null);
      setStatus(message);
    }
  };

  const handleSignOut = async () => {
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to end the server session.");
      }
      if (auth) await signOut(auth);
      setUser(null);
      setStatus("Signed out successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign-out failed.";
      setStatus(message);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 lg:px-8">
      <div className="glass-panel rounded-[32px] p-8">
        <div className="text-sm font-medium uppercase tracking-[0.18em] text-[#f0b90b]">
          Authentication
        </div>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-white">
          Sign in to AGENTX ARENA
        </h1>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-[#0b1323] p-6">
            <p className="text-slate-300">
              This app is structured for Firebase Authentication and Firestore-backed user records. The
              authentication flow is environment-aware and will remain disabled until Firebase is configured.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleGoogleSignIn}
                className="rounded-full bg-[#f0b90b] px-5 py-3 font-semibold text-[#0f172a] disabled:opacity-60"
                disabled={
                  loading || !isFirebaseConfigured() || !authConfigured || Boolean(user)
                }
              >
                Continue with Google
              </button>

              <button
                onClick={handleSignOut}
                className="rounded-full border border-white/10 px-5 py-3 font-semibold text-white disabled:opacity-60"
                disabled={loading || !user}
              >
                Sign out
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-[#0a1220] p-4 text-sm text-slate-200">
              Status: {status}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#101a2d] p-6">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Session</div>
            <div className="mt-4 text-2xl font-black text-white">
              {user?.email ?? user?.displayName ?? "Not connected"}
            </div>

            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              <li>• Firebase sign-in identifies your AGENTX ARENA account</li>
              <li>• Binance MCP access requires separate explicit authorization</li>
              <li>• MCP authorization does not verify Binance Agent ID ownership</li>
              <li>• Trading and transfer tools are not enabled in AGENTX ARENA</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
