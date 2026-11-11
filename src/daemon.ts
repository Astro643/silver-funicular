import { inngest } from "./inngest.ts"
import { queue, TOPIC, GROUP, type AgentTask } from "./lib/queue.ts"
import { executeStep } from "./agent/executor.ts"
import { redis } from "./lib/redis.ts"
import { initDb } from "./lib/db.ts"

let running = true
process.on("SIGTERM", () => {
  running = false
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function processTask(task: AgentTask) {
  const results = []
  for (const step of task.steps) {
    if (!running) break
    const result = await executeStep(step, task.serverId)
    results.push(result)
    await redis.rpush(`progress:${task.goalId}`, result)
  }
  await inngest.send({
    name: "agent/goal.completed",
    data: { goalId: task.goalId, status: running ? "completed" : "interrupted", results },
  })
}

async function loop() {
  while (running) {
    const res = await queue.receive(TOPIC, GROUP, async (task: AgentTask) => processTask(task))
    if (!res.ok) await sleep(1000)
  }
}

await initDb()
console.log("daemon: listening on topic", TOPIC, "group", GROUP)
loop().catch((err) => {
  console.error("daemon: fatal", err)
  process.exit(1)
})
