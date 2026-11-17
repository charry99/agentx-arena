import { isBinanceOAuthEncryptionKeyValid } from "@/lib/binance-mcp";

export type RuntimeCheck = {
  key: string;
  configured: boolean;
};

export type RuntimeConfigSummary = {
  firebaseClientConfigured: boolean;
  firebaseServerConfigured: boolean;
  binanceMcpEncryptionConfigured: boolean;
  githubConfigured: boolean;
  authConfigured: boolean;
  missing: string[];
};

export function getRuntimeConfigSummary(): RuntimeConfigSummary {
  const firebaseClientConfigured = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET &&
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
  const firebaseServerConfigured = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
  const checks: Array<RuntimeCheck> = [
    { key: "NEXT_PUBLIC_FIREBASE_API_KEY", configured: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY) },
    { key: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", configured: Boolean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) },
    { key: "NEXT_PUBLIC_FIREBASE_PROJECT_ID", configured: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) },
    { key: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", configured: Boolean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) },
    { key: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", configured: Boolean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) },
    { key: "NEXT_PUBLIC_FIREBASE_APP_ID", configured: Boolean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID) },
    { key: "FIREBASE_PROJECT_ID", configured: Boolean(process.env.FIREBASE_PROJECT_ID) },
    { key: "FIREBASE_CLIENT_EMAIL", configured: Boolean(process.env.FIREBASE_CLIENT_EMAIL) },
    { key: "FIREBASE_PRIVATE_KEY", configured: Boolean(process.env.FIREBASE_PRIVATE_KEY) },
    {
      key: "BINANCE_OAUTH_ENCRYPTION_KEY",
      configured: isBinanceOAuthEncryptionKeyValid(),
    },
    { key: "GITHUB_CLIENT_ID", configured: Boolean(process.env.GITHUB_CLIENT_ID) },
    { key: "GITHUB_CLIENT_SECRET", configured: Boolean(process.env.GITHUB_CLIENT_SECRET) },
  ];

  const missing = checks.filter((entry) => !entry.configured).map((entry) => entry.key);

  return {
    firebaseClientConfigured,
    firebaseServerConfigured,
    binanceMcpEncryptionConfigured: isBinanceOAuthEncryptionKeyValid(),
    githubConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    authConfigured: firebaseClientConfigured && firebaseServerConfigured,
    missing,
  };
}
