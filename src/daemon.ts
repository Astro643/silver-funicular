import { Sandbox } from "@vercel/sandbox"
import { queue, TOPIC, GROUP, type AgentTask } from "./lib/queue.ts"
import type { PlannedStep } from "./agent/understand.ts"
import { redis } from "./lib/redis.ts"
import { inngest } from "./workflow.ts"
import { initDb } from "./lib/db.ts"

let running = true
process.on("SIGTERM", () => {
  running = false
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const clip = (s: string, max = 2000) =>
  s.length > max ? s.slice(0, max) + "…" : s

async function executeStep(step: PlannedStep, _serverId: string) {
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | undefined
  try {
    sandbox = await Sandbox.create()
    const cmd = await sandbox.runCommand("sh", ["-lc", step.action], { timeoutMs: 60_000 })
    const ok = cmd.exitCode === 0
    return {
      label: step.label,
      ok,
      detail: clip(ok ? cmd.stdout : cmd.stderr || cmd.stdout),
    }
  } catch (err) {
    return { label: step.label, ok: false, detail: clip(String(err)) }
  } finally {
    await sandbox?.stop()
  }
}

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
