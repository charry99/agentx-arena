import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
  type Tool,
} from "@modelcontextprotocol/client";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { firestoreCollections } from "@/lib/firestore-schema";

export const BINANCE_MCP_ENDPOINT = "https://agent.binance.com/mcp/agentic";
const PENDING_CONNECTION_MS = 10 * 60 * 1000;

export type BinanceMcpConnectionStatus =
  | "disconnected"
  | "pending"
  | "connected"
  | "unavailable";

export type BinanceMcpConnectionSummary = {
  status: BinanceMcpConnectionStatus;
  authorizedScopes: string[];
  readOnlyTools: string[];
  identityVerification: "UNAVAILABLE";
  financialActionsEnabled: false;
  updatedAt: string | null;
};

type OAuthSessionState = {
  state?: string;
  codeVerifier?: string;
  clientInformation?: StoredOAuthClientInformation;
  tokens?: StoredOAuthTokens;
  discoveryState?: OAuthDiscoveryState;
};

type EncryptedOAuthSession = {
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
};

function getEncryptionKey() {
  const encoded = process.env.BINANCE_OAUTH_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("Binance OAuth encryption is not configured.");
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("BINANCE_OAUTH_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }

  return key;
}

export function isBinanceOAuthEncryptionKeyValid() {
  const encoded = process.env.BINANCE_OAUTH_ENCRYPTION_KEY;
  if (!encoded) return false;

  const key = Buffer.from(encoded, "base64");
  return key.length === 32 && key.toString("base64") === encoded;
}

function encryptSession(state: OAuthSessionState): EncryptedOAuthSession {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(state), "utf8"),
    cipher.final(),
  ]);

  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptSession(value: unknown): OAuthSessionState {
  if (
    typeof value !== "object" ||
    value === null ||
    !("algorithm" in value) ||
    value.algorithm !== "aes-256-gcm" ||
    !("iv" in value) ||
    typeof value.iv !== "string" ||
    !("authTag" in value) ||
    typeof value.authTag !== "string" ||
    !("ciphertext" in value) ||
    typeof value.ciphertext !== "string"
  ) {
    throw new Error("Stored Binance OAuth data is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Stored Binance OAuth data is invalid.");
  }

  return parsed as OAuthSessionState;
}

function getCallbackUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is required for Binance authorization.");
  }

  const callbackUrl = new URL("/api/binance/connection/callback", appUrl);
  if (process.env.NODE_ENV === "production" && callbackUrl.protocol !== "https:") {
    throw new Error("Binance authorization requires an HTTPS app URL in production.");
  }

  return callbackUrl;
}

class BinanceOAuthProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null;

  constructor(private readonly oauthState: OAuthSessionState = {}) {}

  get redirectUrl() {
    return getCallbackUrl();
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "AGENTX ARENA",
      redirect_uris: [this.redirectUrl.toString()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state() {
    this.oauthState.state = randomBytes(32).toString("base64url");
    return this.oauthState.state;
  }

  clientInformation() {
    return this.oauthState.clientInformation;
  }

  saveClientInformation(clientInformation: StoredOAuthClientInformation) {
    this.oauthState.clientInformation = clientInformation;
  }

  tokens() {
    return this.oauthState.tokens;
  }

  saveTokens(tokens: StoredOAuthTokens) {
    this.oauthState.tokens = tokens;
  }

  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }

  saveCodeVerifier(codeVerifier: string) {
    this.oauthState.codeVerifier = codeVerifier;
  }

  codeVerifier() {
    if (!this.oauthState.codeVerifier) {
      throw new Error("Binance OAuth PKCE verifier is unavailable.");
    }

    return this.oauthState.codeVerifier;
  }

  saveDiscoveryState(discoveryState: OAuthDiscoveryState) {
    this.oauthState.discoveryState = discoveryState;
  }

  discoveryState() {
    return this.oauthState.discoveryState;
  }

  get persistedState() {
    return this.oauthState;
  }
}

function connectionRef(db: NonNullable<Awaited<ReturnType<typeof getAdminFirestore>>>, uid: string) {
  return db.collection(firestoreCollections.binanceMcpConnections).doc(uid);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((item) => typeof item === "string" && item.length <= 256)
  );
}

function getReadOnlyToolNames(tools: Tool[]) {
  return tools
    .filter((tool) => tool.annotations?.readOnlyHint === true)
    .map((tool) => tool.name)
    .filter((name) => name.length <= 256)
    .slice(0, 100);
}

function getScopes(tokens: StoredOAuthTokens | undefined) {
  return typeof tokens?.scope === "string"
    ? [...new Set(tokens.scope.split(/\s+/).filter(Boolean))].slice(0, 100)
    : [];
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getPendingExpiry(data: Record<string, unknown>) {
  return data.pendingExpiresAt instanceof Timestamp
    ? data.pendingExpiresAt.toMillis()
    : 0;
}

async function failBinanceMcpAuthorization(
  uid: string,
  flowId: string,
  error: unknown,
): Promise<never> {
  try {
    await markBinanceMcpConnectionUnavailable(uid, flowId);
  } catch (cleanupError) {
    console.error(
      "Failed to reset the Binance MCP connection after an error.",
      cleanupError instanceof Error ? cleanupError.name : "Unknown error",
    );
  }
  throw error;
}

function serializeUpdatedAt(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

export async function getBinanceMcpConnectionSummary(
  uid: string,
): Promise<BinanceMcpConnectionSummary> {
  const db = await getAdminFirestore();
  if (!db) throw new Error("Firebase Admin Firestore is not available.");

  const ref = connectionRef(db, uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return {
      status: "disconnected",
      authorizedScopes: [],
      readOnlyTools: [],
      identityVerification: "UNAVAILABLE",
      financialActionsEnabled: false,
      updatedAt: null,
    };
  }

  const data = snapshot.data() ?? {};
  const status =
    data.status === "connected" ||
    data.status === "pending" ||
    data.status === "disconnected"
      ? data.status
      : "unavailable";
  const pendingExpired =
    status === "pending" && getPendingExpiry(data) <= Date.now();

  if (pendingExpired) {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      const currentData = current.data();
      if (
        currentData?.status === "pending" &&
        currentData.flowId === data.flowId &&
        getPendingExpiry(currentData) <= Date.now()
      ) {
        transaction.update(ref, {
          status: "disconnected",
          encryptedOAuthSession: FieldValue.delete(),
          pendingExpiresAt: FieldValue.delete(),
          flowId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return {
      status: "disconnected",
      authorizedScopes: [],
      readOnlyTools: [],
      identityVerification: "UNAVAILABLE",
      financialActionsEnabled: false,
      updatedAt: serializeUpdatedAt(data.updatedAt),
    };
  }

  return {
    status,
    authorizedScopes: isStringArray(data.authorizedScopes)
      ? data.authorizedScopes
      : [],
    readOnlyTools: isStringArray(data.readOnlyTools) ? data.readOnlyTools : [],
    identityVerification: "UNAVAILABLE",
    financialActionsEnabled: false,
    updatedAt: serializeUpdatedAt(data.updatedAt),
  };
}

export async function beginBinanceMcpAuthorization(uid: string) {
  getEncryptionKey();
  const db = await getAdminFirestore();
  if (!db) throw new Error("Firebase Admin Firestore is not available.");

  const ref = connectionRef(db, uid);
  const flowId = randomBytes(24).toString("base64url");
  const expiresAt = Timestamp.fromMillis(Date.now() + PENDING_CONNECTION_MS);
  const started = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.data();
    if (current?.status === "connected") return "connected" as const;
    if (
      current?.status === "pending" &&
      getPendingExpiry(current) > Date.now()
    ) {
      return "pending" as const;
    }

    transaction.set(
      ref,
      {
        userId: uid,
        status: "pending",
        flowId,
        authorizedScopes: [],
        readOnlyTools: [],
        encryptedOAuthSession: FieldValue.delete(),
        connectedAt: FieldValue.delete(),
        pendingExpiresAt: expiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return "started" as const;
  });

  if (started === "connected") {
    throw new Error("A Binance MCP connection is already active. Disconnect it first.");
  }
  if (started === "pending") {
    throw new Error("A Binance authorization is already pending for this account.");
  }

  const provider = new BinanceOAuthProvider();
  const client = new Client({ name: "agentx-arena", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(BINANCE_MCP_ENDPOINT),
    { authProvider: provider },
  );

  try {
    try {
      await client.connect(transport);
      await client.listTools();
    } catch (error) {
      if (!UnauthorizedError.isInstance(error)) throw error;
    }
  } catch (error) {
    await markBinanceMcpConnectionUnavailable(uid, flowId);
    console.error(
      "Failed to initialize the Binance MCP authorization flow.",
      error instanceof Error ? error.name : "Unknown error",
    );
    throw new Error("Unable to start Binance authorization. Please try again later.");
  } finally {
    await client.close();
  }

  const authorizationUrl = provider.authorizationUrl;
  const state = provider.persistedState.state;
  if (
    !authorizationUrl ||
    authorizationUrl.protocol !== "https:" ||
    !state ||
    authorizationUrl.searchParams.get("state") !== state
  ) {
    await markBinanceMcpConnectionUnavailable(uid, flowId);
    throw new Error("The Binance MCP server did not start a valid authorization flow.");
  }

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.data()?.flowId !== flowId) {
      throw new Error("The Binance authorization flow was replaced.");
    }
    transaction.update(ref, {
      encryptedOAuthSession: encryptSession(provider.persistedState),
      pendingExpiresAt: expiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return authorizationUrl.toString();
}

export async function completeBinanceMcpAuthorization(
  uid: string,
  callbackParams: URLSearchParams,
) {
  const db = await getAdminFirestore();
  if (!db) throw new Error("Firebase Admin Firestore is not available.");

  const ref = connectionRef(db, uid);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (
    !snapshot.exists ||
    data?.status !== "pending" ||
    typeof data.flowId !== "string"
  ) {
    throw new Error("The Binance authorization flow is missing or expired.");
  }

  const flowId = data.flowId;
  let oauthState: OAuthSessionState;
  try {
    if (getPendingExpiry(data) <= Date.now()) {
      throw new Error("The Binance authorization flow is missing or expired.");
    }

    oauthState = decryptSession(data.encryptedOAuthSession);
    const callbackState = callbackParams.get("state");
    if (
      !callbackState ||
      callbackState.length > 512 ||
      !oauthState.state ||
      !constantTimeEqual(callbackState, oauthState.state)
    ) {
      throw new Error("The Binance authorization state is invalid.");
    }
  } catch (error) {
    return failBinanceMcpAuthorization(uid, flowId, error);
  }

  try {
    const provider = new BinanceOAuthProvider(oauthState);
    const authTransport = new StreamableHTTPClientTransport(
      new URL(BINANCE_MCP_ENDPOINT),
      { authProvider: provider },
    );
    await authTransport.finishAuth(callbackParams);

    if (!provider.tokens()?.access_token) {
      throw new Error("Binance authorization did not return an access token.");
    }

    const client = new Client({ name: "agentx-arena", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(BINANCE_MCP_ENDPOINT),
      { authProvider: provider },
    );

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const authorizedScopes = getScopes(provider.tokens());
      const readOnlyTools = getReadOnlyToolNames(tools);

      await db.runTransaction(async (transaction) => {
        const current = await transaction.get(ref);
        if (
          current.data()?.status !== "pending" ||
          current.data()?.flowId !== flowId
        ) {
          throw new Error("The Binance authorization flow is no longer active.");
        }
        transaction.update(ref, {
          status: "connected",
          authorizedScopes,
          readOnlyTools,
          encryptedOAuthSession: encryptSession(provider.persistedState),
          connectedAt: FieldValue.serverTimestamp(),
          flowId: FieldValue.delete(),
          pendingExpiresAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    } finally {
      try {
        // Best effort: the connection is already stored, so a failure to end
        // the MCP session must not be reported as a failed authorization.
        await transport.terminateSession();
      } catch {
        // Ignore servers that do not support explicit session termination.
      }
      await client.close();
    }
  } catch (error) {
    return failBinanceMcpAuthorization(uid, flowId, error);
  }
}

export async function cancelBinanceMcpAuthorization(
  uid: string,
  callbackState: string,
) {
  const db = await getAdminFirestore();
  if (!db) throw new Error("Firebase Admin Firestore is not available.");

  const ref = connectionRef(db, uid);
  let flowId: string | undefined;
  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      if (data?.status !== "pending" || typeof data.flowId !== "string") {
        throw new Error("The Binance authorization flow is missing or expired.");
      }

      flowId = data.flowId;
      if (getPendingExpiry(data) <= Date.now()) {
        throw new Error("The Binance authorization flow is missing or expired.");
      }

      const oauthState = decryptSession(data.encryptedOAuthSession);
      if (
        !callbackState ||
        callbackState.length > 512 ||
        !oauthState.state ||
        !constantTimeEqual(callbackState, oauthState.state)
      ) {
        throw new Error("The Binance authorization state is invalid.");
      }

      transaction.update(ref, {
        status: "disconnected",
        authorizedScopes: [],
        readOnlyTools: [],
        encryptedOAuthSession: FieldValue.delete(),
        pendingExpiresAt: FieldValue.delete(),
        flowId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    if (!flowId) throw error;
    return failBinanceMcpAuthorization(uid, flowId, error);
  }
}

export async function markBinanceMcpConnectionUnavailable(
  uid: string,
  flowId?: string,
) {
  const db = await getAdminFirestore();
  if (!db) throw new Error("Firebase Admin Firestore is not available.");

  const ref = connectionRef(db, uid);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (flowId && data?.flowId !== flowId) return;
    transaction.set(
      ref,
      {
        userId: uid,
        status: "unavailable",
        authorizedScopes: [],
        readOnlyTools: [],
        encryptedOAuthSession: FieldValue.delete(),
        pendingExpiresAt: FieldValue.delete(),
        flowId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export async function disconnectBinanceMcp(uid: string) {
  const db = await getAdminFirestore();
  if (!db) throw new Error("Firebase Admin Firestore is not available.");

  await connectionRef(db, uid).set(
    {
      userId: uid,
      status: "disconnected",
      authorizedScopes: [],
      readOnlyTools: [],
      encryptedOAuthSession: FieldValue.delete(),
      pendingExpiresAt: FieldValue.delete(),
      flowId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
