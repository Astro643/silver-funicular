# Controller backend

TypeScript backend for Controller: one agent (internally split into support/planner/executor, shown as a single agent to users), running as a Vercel Daemon.

## Architecture

```
Frontend (congenial-octo-sniffle)
  │  POST /api/agent
  ▼
Shim (Vercel Function, Hono) ──► Inngest (durable workflow)
  │  GET /api/agent/:goalId        │ understand (Gemini)
  │  long-polls result             │ wait for user confirm
  ▼                                ▼ dispatch
Upstash Redis ◄══════════════ Vercel Queues (agent-tasks)
  ▲                                │
  └── results ◄──────────── Daemon (1Gi, iad1)
                                   └─ each step runs in a Vercel Sandbox
                                      └─ Discord bot can live here too (outbound-only)
```

- **Shim** (`api/[[...route]].ts`) — public HTTP: create goal, confirm plan, long-poll result, Inngest serve endpoint
- **Inngest** (`src/workflow.ts`) — client + durable steps: understand → store plan → wait confirm (24h) → dispatch → wait done → finalize
- **Daemon** (`src/daemon.ts`) — polls the `agent-tasks` topic (consumer group `backend`), executes steps, reports completion
- **Vercel Sandbox** — each step runs as a throwaway sandbox command (60s cap, always stopped after)
- **Neon Postgres** — goals table (audit/durability)
- **Upstash Redis** — results + progress, keyed `result:{goalId}` / `progress:{goalId}`
- **Gemini** — tiered routing: Gemma 4 (routing + answers), Flash-Lite (light work), 3.8 Flash (planning)

## Language choice

TypeScript on Node 24 — type stripping means no build step (`node src/daemon.ts`), same language as the Remix frontend, and every dependency (Inngest, Upstash, Neon, Vercel Queues, Hono, Vercel Sandbox) has a first-class TS SDK.

## Setup

1. On Vercel, add the marketplace integrations to this project: **Neon** (sets `DATABASE_URL`), **Upstash Redis** (sets `UPSTASH_REDIS_REST_URL`/`TOKEN`), **Inngest** (sets `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`).
2. Add `GEMINI_API_KEYS` (comma-separated; keys from different projects each add their own quota) or a single `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com). Keys rotate automatically; a rate-limited key is skipped for 1-5 minutes, a daily-exhausted key (or one that keeps rate-limiting) until UTC midnight.
3. Optional model overrides: `MODEL_STRONG`, `MODEL_LITE`, `MODEL_SUPPORT` (see defaults in `src/lib/gemini.ts`), and `QUEUE_REGION` (default `iad1`).
4. `vercel link && vercel env pull` for local OIDC (Queues + Sandbox auth).
5. Deploy — `vercel.json` provisions one `agent-worker` daemon (1Gi, iad1).
6. In the Inngest dashboard, register the serve URL: `https://<your-deployment>/api/inngest`.

## API

| Route | Purpose |
|---|---|
| `POST /api/agent` | `{message, serverId}` → `{goalId}` |
| `GET /api/agent/:goalId` | long-polls up to 25s → result or `202 {status:"pending"}` |
| `POST /api/agent/:goalId/confirm` | confirm the dry-run plan |
| `POST /api/inngest` | Inngest serve endpoint (do not call directly) |

Result shapes: `{status:"answered", answer}`, `{status:"plan", plan}`, `{status:"completed", results}`, `{status:"expired"}`.

## Notes

- Jobs must stay idempotent: Vercel sends SIGTERM and restarts instances at any time.
- Hobby quota: 1 × 1Gi instance ≈ 744 GB-hours/month — exceeds the 420 GB-hours quota, so the daemon stops around day 17 until the quota resets (accepted trade-off). Sandbox executions and Inngest steps keep working regardless.
