import { Hono } from "hono"
import { serve } from "inngest/hono"
import { inngest, workflows } from "./workflow.ts"
import { getResult, redis } from "./lib/redis.ts"
import { recordGoal, sql } from "./lib/db.ts"
import { generate, MODELS } from "./lib/gemini.ts"

export const app = new Hono().basePath("/api")

app.use("/inngest", serve({ client: inngest, functions: workflows }))

app.post("/agent", async (c) => {
  const { message, serverId } = await c.req.json<{ message: string; serverId: string }>()
  if (!message || !serverId) return c.json({ error: "message and serverId required" }, 400)

  const goalId = crypto.randomUUID()
  await recordGoal(goalId, serverId, message)
  await inngest.send({ name: "agent/goal.requested", data: { goalId, serverId, message } })
  return c.json({ goalId })
})

app.post("/agent/:goalId/confirm", async (c) => {
  const goalId = c.req.param("goalId")
  await inngest.send({ name: "agent/goal.confirmed", data: { goalId } })
  return c.json({ ok: true })
})

app.get("/agent/:goalId", async (c) => {
  const goalId = c.req.param("goalId")
  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    const result = await getResult(goalId)
    if (result) return c.json(result)
    await new Promise((r) => setTimeout(r, 150))
  }
  return c.json({ status: "pending" }, 202)
})

const SUPPORT_SYSTEM =
  "You are Controller's support assistant for a Discord server management product. " +
  "Answer the user's question clearly and briefly. Do not invent features."

app.get("/public/status", async (c) => {
  const check = async (p: Promise<unknown>) => {
    try {
      await p
      return "operational"
    } catch {
      return "outage"
    }
  }
  const [queue, db] = await Promise.all([check(redis.ping()), check(sql`SELECT 1`)])
  const overall = queue === "operational" && db === "operational" ? "operational" : "outage"
  return c.json({
    overall,
    label: overall === "operational" ? "All systems operational" : "Partial outage",
    updated: new Date().toISOString(),
    components: [
      { name: "Agent queue", detail: "", status: queue },
      { name: "Database", detail: "", status: db },
    ],
  })
})

app.post("/support/chat", async (c) => {
  const { message, history } = await c.req.json<{ message: string; history?: { role: string; text: string }[] }>()
  if (!message) return c.json({ detail: "message required" }, 400)
  try {
    const convo = (history ?? []).map((m) => `${m.role}: ${m.text}`).join("\n")
    const reply = await generate(MODELS.support, convo ? `${convo}\nuser: ${message}` : message, SUPPORT_SYSTEM)
    return c.json({ reply })
  } catch (e) {
    console.error("support chat failed:", e)
    return c.json({ detail: "Support is temporarily unavailable. Please try again." }, 503)
  }
})
