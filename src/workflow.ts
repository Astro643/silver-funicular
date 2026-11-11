import { Inngest } from "inngest"
import { understand } from "./agent/understand.ts"
import { sendTask } from "./lib/queue.ts"
import { setResult } from "./lib/redis.ts"
import { setGoalPlan, setGoalStatus } from "./lib/db.ts"

export const inngest = new Inngest({ id: "controller" })

interface GoalRequested {
  data: {
    goalId: string
    serverId: string
    message: string
  }
}

export const workflows = [
  inngest.createFunction(
    { id: "goal-workflow", retries: 2, triggers: [{ event: "agent/goal.requested" }] },
    async ({ event, step }) => {
      const { goalId, serverId, message } = (event as unknown as GoalRequested).data

      const outcome = await step.run("understand", () => understand(message, serverId))

      if (outcome.type === "question") {
        await step.run("answer", async () => {
          await setResult(goalId, { status: "answered", answer: outcome.answer })
          await setGoalStatus(goalId, "answered")
        })
        return
      }

      await step.run("store-plan", async () => {
        await setResult(goalId, { status: "plan", plan: outcome.plan })
        await setGoalPlan(goalId, outcome.plan)
      })

      const confirmed = await step.waitForEvent("wait-confirm", {
        event: "agent/goal.confirmed",
        timeout: "24h",
        match: "data.goalId",
      })

      if (!confirmed) {
        await step.run("expire", async () => {
          await setResult(goalId, { status: "expired" })
          await setGoalStatus(goalId, "expired")
        })
        return
      }

      await step.run("dispatch", async () => {
        await setGoalStatus(goalId, "executing")
        await sendTask({ goalId, serverId, steps: outcome.plan.steps })
      })

      const done = await step.waitForEvent("wait-done", {
        event: "agent/goal.completed",
        timeout: "1h",
        match: "data.goalId",
      })

      await step.run("finalize", async () => {
        const results = done?.data ?? { status: "failed" }
        await setResult(goalId, results)
        await setGoalStatus(goalId, done ? "completed" : "failed")
      })
    },
  ),
]
