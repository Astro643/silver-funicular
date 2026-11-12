# Controller backend

TypeScript backend for Controller: one agent (internally split into support/planner/executor, shown as a single agent to users), running as a Vercel Daemon.

## Architecture

```
Frontend (congenial-octo-sniffle)
  │  POST /api/agent
  ▼
API (Hono, container web service) ──► Inngest (durable workflow)
  │  GET /api/agent/:goalId        │ understand (Gemini)
  │  long-polls result             │ wait for user confirm
  ▼                                ▼ dispatch
Upstash Redis ◄══════════════════ Vercel Queues (agent-tasks)
  ▲                                │
  └── results ◄─── Daemon (1Gi, iad1)
                                   └─ each step runs in a Vercel Sandbox
                                      └─ Discord bot can live here too (outbound-only)
```

- **API** (`src/app.ts`, served by `src/server.ts`) — public HTTP: create goal, confirm plan, long-poll result, Inngest serve endpoint
- **Inngest** (`src/workflow.ts`) — client + durable steps: understand → store plan → wait confirm (24h) → dispatch → wait done → finalize
- **Daemon** (`src/daemon.ts`) — polls the `agent-tasks` topic (consumer group `backend`), executes steps, reports completion
- **Vercel Sandbox** — each step runs as a throwaway sandbox command (60s cap, always stopped after)
- **Neon Postgres** — goals table (audit/durability)
- **Upstash Redis** — results + progress, keyed `result:{goalId}` / `progress:{goalId}`
- **Gemini** — tiered routing: Gemma 4 (routing + answers), Flash-Lite (light work), 3.8 Flash (planning)

## Language choice
