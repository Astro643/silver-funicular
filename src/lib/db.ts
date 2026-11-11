import { neon } from "@neondatabase/serverless"

export const sql = neon(process.env.DATABASE_URL!)

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS goals (
      id uuid PRIMARY KEY,
      server_id text NOT NULL,
      message text NOT NULL,
      status text NOT NULL DEFAULT 'received',
      plan jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `
}

export async function recordGoal(goalId: string, serverId: string, message: string) {
  await sql`INSERT INTO goals (id, server_id, message) VALUES (${goalId}, ${serverId}, ${message})`
}

export async function setGoalPlan(goalId: string, plan: unknown) {
  await sql`UPDATE goals SET plan = ${JSON.stringify(plan)}::jsonb, status = 'awaiting_confirmation' WHERE id = ${goalId}`
}

export async function setGoalStatus(goalId: string, status: string) {
  await sql`UPDATE goals SET status = ${status} WHERE id = ${goalId}`
}
