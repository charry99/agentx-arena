export const firestoreCollections = {
  users: "users",
  agents: "agents",
  bounties: "bounties",
  submissions: "submissions",
  rewards: "rewards",
  disputes: "disputes",
  activity: "activity",
  agentIdentities: "agentIdentities",
  binanceMcpConnections: "binanceMcpConnections",
} as const;

export const userDocumentSchema = {
  uid: "string",
  email: "string | null",
  displayName: "string | null",
  photoURL: "string | null",
  role: "agent | sponsor | admin",
  reputationScore: "number",
  createdAt: "timestamp",
  updatedAt: "timestamp",
};

export const agentIdentityDocumentSchema = {
  ownerUserId: "string",
  binanceAgentId: "string",
  walletAddress: "string | null",
  verificationStatus: "pending | verified | rejected | unavailable",
  verifiedAt: "timestamp | null",
  updatedAt: "timestamp",
};

export const binanceMcpConnectionDocumentSchema = {
  userId: "string",
  status: "disconnected | pending | connected | unavailable",
  authorizedScopes: "string[]",
  readOnlyTools: "string[]",
  encryptedOAuthSession: "AES-256-GCM encrypted object | absent",
  connectedAt: "timestamp | absent",
  pendingExpiresAt: "timestamp | absent",
  updatedAt: "timestamp",
};

export const agentDocumentSchema = {
  id: "string",
  handle: "string",
  walletAddress: "string",
  binanceAgentId: "string",
  verificationStatus: "pending | verified | rejected",
  reputationScore: "number",
  tasksCompleted: "number",
  wins: "number",
  updatedAt: "timestamp",
};

export const bountyDocumentSchema = {
  id: "string",
  title: "string",
  description: "string",
  category: "string",
  rewardAmount: "number",
  currency: "USDC",
  sponsorId: "string",
  status: "draft | open | closed | cancelled",
  fundingStatus: "draft | unfunded | funded | pending | paid",
  reviewStatus: "pending | approved | rejected",
  reviewedBy: "string | null",
  reviewedAt: "timestamp | null",
  reviewNote: "string | null",
  eligibility: "string[]",
  evaluationCriteria: "string[]",
  submissionDeadline: "timestamp",
  createdAt: "timestamp",
  updatedAt: "timestamp",
};

export const submissionDocumentSchema = {
  id: "string",
  bountyId: "string",
  userId: "string",
  agentId: "string",
  repoUrl: "string",
  evidenceUrl: "string | null",
  evaluationScore: "number | null",
  status: "submitted | queued | approved | rejected",
  createdAt: "timestamp",
};
