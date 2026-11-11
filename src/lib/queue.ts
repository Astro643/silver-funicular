import { PollingQueueClient } from "@vercel/queue"

export const TOPIC = "agent-tasks"
export const GROUP = "backend"
export const REGION = process.env.QUEUE_REGION ?? "iad1"

export const queue = new PollingQueueClient({ region: REGION, deploymentId: null })

export interface AgentTask {
  goalId: string
  serverId: string
  steps: { label: string; action: string }[]
}

export const sendTask = (task: AgentTask) => queue.send(TOPIC, task)
