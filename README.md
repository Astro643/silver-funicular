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
Upstash Redis ◄───────────── Vercel Queues (agent-tasks)
  ▲                                │
  └── results ◄────────── Daemon (512Mi, iad1) — executes steps
                                   └─ Discord bot can live here too (outbound-only)
```

- **Shim** (`api/[[...route]].ts`) — public HTTP: create goal, confirm plan, long-poll result, Inngest serve endpoint
- **Inngest** (`src/workflow.ts`) — durable steps: understand → store plan → wait confirm (24h) → dispatch → wait done → finalize
- **Daemon** (`src/daemon.ts`) — polls the `agent-tasks` topic (consumer group `backend`), executes steps, reports completion
- **Neon Postgres** — goals table (audit/durability)
- **Upstash Redis** — results + progress, keyed `result:{goalId}` / `progress:{goalId}`
- **Gemini** — tiered routing: Gemma 4 (routing + answers), Flash-Lite (light work), 3.8 Flash (planning)

## Language choice

TypeScript on Node 24 — type stripping means no build step (`node src/daemon.ts`), same language as the Remix frontend, and every dependency (Inngest, Upstash, Neon, Vercel Queues, Hono) has a first-class TS SDK.

## Setup

1. On Vercel, add the marketplace integrations to this project: **Neon** (sets `DATABASE_URL`), **Upstash Redis** (sets `UPSTASH_REDIS_REST_URL`/`TOKEN`), **Inngest** (sets `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`).
2. Add `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com).
3. `vercel link && vercel env pull` for local OIDC (Queues auth).
4. Deploy — `vercel.json` provisions one `agent-worker` daemon (512Mi, iad1).
5. In the Inngest dashboard, register the serve URL: `https://<your-deployment>/api/inngest`.

## API

| Route | Purpose |
|---|---|
| `POST /api/agent` | `{message, serverId}` → `{goalId}` |
| `GET /api/agent/:goalId` | long-polls up to 25s → result or `202 {status:"pending"}` |
| `POST /api/agent/:goalId/confirm` | confirm the dry-run plan |
| `POST /api/inngest` | Inngest serve endpoint (do not call directly) |

Result shapes: `{status:"answered", answer}`, `{status:"plan", plan}`, `{status:"completed", results}`, `{status:"expired"}`.

## Notes

- The executor (`src/agent/executor.ts`) is a fail-safe stub — no live Discord calls until you implement real actions.
- Jobs must stay idempotent: Vercel sends SIGTERM and restarts instances at any time.
- Hobby quota: 1 × 512Mi instance ≈ 372 GB-hours/month — fits the full month.
