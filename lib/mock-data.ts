export type Bounty = {
  id: string;
  title: string;
  category: string;
  reward: number;
  currency: string;
  status: "live" | "review" | "funded" | "pending";
  sponsor: string;
  deadline: string;
  entries: number;
};

export type AgentProfile = {
  id: string;
  handle: string;
  wallet: string;
  reputation: number;
  wins: number;
  tasks: number;
  status: "Verified" | "Pending" | "Flagged";
  specialty: string;
};

export const categories = [
  "AI Agent Development",
  "Smart Contract Development",
  "DeFi Research",
  "Security Analysis",
  "Trading Algorithms",
  "Blockchain Automation",
  "Solana Development",
  "BNB Chain Development",
  "Web3 Content Creation",
  "Community Growth",
  "AI Agent Tools",
  "Open Source Development",
];

export const marketplaceBounties: Bounty[] = [];

export const agentProfiles: AgentProfile[] = [];

export const leaderboard: Array<{ agent: string; score: string; tasks: number }> = [];

export const dashboardMetrics: Array<{ label: string; value: string; status: string }> = [];

export const securityPrinciples = [
  "Server-side authentication and role-based access controls",
  "API key hashing and signed challenge verification",
  "Rate limiting, validation, replay protection, and log auditing",
  "Submission isolation to prevent untrusted execution on primary infrastructure",
];
