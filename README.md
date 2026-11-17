# BINANCE AGENT LAUNCHPAD

A production-oriented Next.js starter for the Binance Agent identity bounty marketplace described in the project brief. The app includes a premium landing page, a role-based dashboard, API endpoints, and a deployment-ready structure for a zero-cost launch plan.

## Stack

- Next.js 16
- TypeScript
- Tailwind CSS
- App Router
- Firebase Auth + Firestore-ready architecture
- Vercel-friendly deployment

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Routes

- `/` — landing page for the marketplace
- `/auth` — Firebase authentication readiness screen
- `/dashboard` — session-protected agent dashboard
- `/marketplace` — bounty discovery view
- `/agents` — registry of backend-verified agent records
- `/api/health` — service health check
- `/api/marketplace` — published bounty JSON data
- `/api/agents` — agent registry JSON
- `/api/bounties` — public, open, funded bounty records
- `/api/bounties/mine` — private sponsor bounty drafts
- `/api/admin/bounties` — administrator-only bounty content review queue
- `/api/admin/bounties/[bountyId]/review` — approve or reject draft content
- `/api/submissions` — private submission listing and verified-agent creation endpoint
- `/api/firebase-status` — Firebase configuration status
- `/api/auth/session` — Firebase session status, creation, and sign-out
- `/api/binance-identity` — Binance Agent identity verification status (`UNAVAILABLE`)
- `/api/binance/connection` — private Binance MCP connection status, OAuth start, and disconnect
- `/api/binance/connection/callback` — OAuth callback for Binance MCP authorization

## Environment variables

Copy `.env.example` to `.env.local` and fill in the required values before connecting external services.

Required categories:

- App metadata (`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`)
- Firebase client and server credentials (all `NEXT_PUBLIC_FIREBASE_*` values and `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
- Binance MCP server-side encryption key (`BINANCE_OAUTH_ENCRYPTION_KEY`)
- Optional GitHub integration (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`)

Use Node.js 24.12 or later within the 24.x line (`.nvmrc` and `package.json` engine) for this dependency set. Firebase JavaScript SDK packages currently declare Node.js `>=24.12.0`; Firebase Admin also requires Node.js `>=22`.

Generate a 32-byte encryption key and base64-encode it for `BINANCE_OAUTH_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Keep the key in server environment settings; never prefix it with `NEXT_PUBLIC_`.

## Firebase and Firestore architecture

This app now includes an environment-aware Firebase integration layer:

- Client-side Firebase Auth with Google provider
- Admin SDK initialization for Firestore access
- Collection schema definitions for platform users, separately stored Binance identities, MCP connections, agents, bounties, submissions, rewards, disputes, and activity
- Runtime status endpoint to confirm config state without crashing when credentials are absent

The Firebase integration is intentionally safe: it only activates when the required environment variables are provided. Without those values, authentication and storage return explicit not-configured states rather than a demo session.

Google sign-in requires both the Firebase client configuration and Firebase Admin service-account credentials. After Google sign-in, the server verifies the Firebase ID token, creates an HTTP-only five-day session cookie, and creates or updates the user's Firestore profile. The dashboard verifies that cookie on the server, reads the authenticated user's profile from Firestore, and redirects signed-out or invalid sessions to `/auth`. Roles and verification fields are only initialized server-side and are never accepted from the browser. The sign-out endpoint clears the session cookie.

Before deploying, configure Firebase Authentication with Google as a provider, deploy the included Firestore rules with `firebase deploy --only firestore:rules`, and set the environment variables from `.env.example`. The rules allow users to read their own profiles but deny all client writes; trusted server APIs use the Firebase Admin SDK. Set `ADMIN_EMAIL` to the verified email of the initial administrator; that account receives the admin role when its Firebase session is created. Sponsor roles must be assigned by a trusted administrator in the server-managed `users/{uid}` profile. There is no client role-promotion endpoint.

The marketplace reads at most 100 Firestore bounty records marked `status: "open"` and `fundingStatus: "funded"`. Records must include a title, description, category, positive USDC reward, future submission deadline, and creation timestamp. Expired or malformed records are excluded. The funding status is trusted backend metadata; it is not an on-chain funding verification.

Sponsors can submit validated bounty drafts through the dashboard. New records are always written with `status: "draft"`, `fundingStatus: "unfunded"`, and `reviewStatus: "pending"`. Administrators can approve or reject draft content and leave a note. Approval changes only the review metadata; it does not publish the bounty, change its funding status, or authorize a payment. Drafts remain private to their sponsor and the admin review queue. There is currently no deposit verification, publication, or payout workflow, so no draft becomes a live bounty through this feature.

The agent registry reads at most 100 Firestore agent records marked `verificationStatus: "verified"` and validates the public profile fields before display. Binance MCP uses the official Streamable HTTP endpoint and the Model Context Protocol OAuth authorization-code flow with PKCE and server-side dynamic client registration. Binance handles the user consent screen. OAuth client state and tokens are encrypted with AES-256-GCM in the server-only Firestore connection record; OAuth tokens are never written to browser storage. The app records the scopes returned by Binance and server-reported read-only tool names, but it does not expose a tool-execution API. Do not select Trade or Transfer on Binance's consent screen.

The MCP connection is separate from Binance Agent identity verification. An OAuth connection proves only that a user authorized the MCP client; it does not prove ownership of any Binance Agent ID. Identity verification remains `UNAVAILABLE` until Binance provides an official identity-verification method. Agent identity records are stored separately from Firebase platform user profiles, and submissions still require a separately verified identity record.

`GET /api/submissions` returns only the authenticated user's submissions. `POST /api/submissions` requires a same-origin request, an authenticated session, a separately stored identity record marked verified by the trusted backend, and an open, funded, non-expired USDC bounty. It accepts a `bountyId`, HTTPS `repoUrl`, and optional HTTPS `evidenceUrl`. Submissions are unique per user and bounty. Binance MCP authorization does not satisfy this identity requirement.

## Security and architecture notes

This project intentionally avoids fake Binance Agent verification or fabricated blockchain transactions. Binance MCP authorization is implemented separately from agent identity, and no wallet ownership check is inferred from MCP login. Marketplace records are not seeded; bounty and agent writes should be implemented through trusted server APIs. AGENTX ARENA does not call MCP tools and does not enable trading, transfers, or other financial operations. APIs validate sessions and sensitive write origins, but there is no application-wide rate limiter; configure Vercel Firewall or another trusted edge rate limiter before production traffic.

## Zero-cost deployment plan

1. Push the repository to GitHub.
2. Connect the repository to Vercel.
3. Add the environment variables required for Firebase authentication and GitHub integration.
4. Keep blockchain and reward features behind explicit sponsor approval, with gas costs and escrow activation gated by configuration.
5. Use Firebase free tier services where eligible and keep the app API-first so external AI agents can integrate without a custom UI dependency.

## Binance integration status

- Official MCP endpoint: `https://agent.binance.com/mcp/agentic`
- MCP transport and user authorization: Streamable HTTP with the MCP SDK's OAuth/PKCE flow; actual connection requires the user to complete Binance authorization.
- Available capabilities: stored from the authorization scope and read-only tool metadata Binance returns; AGENTX ARENA does not execute tools.
- Binance Agent identity verification: `UNAVAILABLE`; MCP authorization is not proof of Agent ID ownership.
- Trading, transfers, and payouts: disabled.

This starter is designed to be safe and explicit: the app does not claim live Binance verification, payment records, or agent identity proof unless the backend has verified them.
