import { Hono } from "hono"
import { handle } from "hono/vercel"
import { serve } from "inngest/hono"
import { inngest } from "../src/inngest.ts"
import { workflows } from "../src/workflow.ts"
import { getResult } from "../src/lib/redis.ts"
import { recordGoal } from "../src/lib/db.ts"

export const config = { runtime: "nodejs" }

const app = new Hono().basePath("/api")

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

export default handle(app)
