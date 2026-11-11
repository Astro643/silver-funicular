import { generate, generateJson, MODELS } from "../lib/gemini.ts"

export interface PlannedStep {
  label: string
  action: string
}

export interface Plan {
  summary: string
  steps: PlannedStep[]
}

export type Outcome =
  | { type: "question"; answer: string }
  | { type: "plan"; plan: Plan }

const ROUTER_SYSTEM =
  "You are Controller, an agent that manages Discord servers. " +
  "Decide whether the user's message is a question about how things work, or an actionable goal for their server. " +
  "Reply with JSON only: {\"intent\": \"question\"} or {\"intent\": \"goal\"}."

const ANSWER_SYSTEM =
  "You are Controller's support assistant for a Discord server management product. " +
  "Answer the user's question clearly and briefly. Do not invent features."

const PLAN_SYSTEM =
  "You are Controller's planner. Given a goal for a Discord server, produce a short summary and an ordered list of concrete steps. " +
  "Each step has a short label and a machine-readable action. Reply with JSON only: " +
  '{"summary": string, "steps": [{"label": string, "action": string}]}.'

export async function understand(message: string, serverId: string): Promise<Outcome> {
  const route = await generateJson<{ intent: "question" | "goal" }>(
    MODELS.support,
    message,
    ROUTER_SYSTEM,
  )

  if (route.intent === "question") {
    const answer = await generate(MODELS.support, message, ANSWER_SYSTEM)
    return { type: "question", answer }
  }

  const plan = await generateJson<Plan>(
    MODELS.strong,
    `Server: ${serverId}\nGoal: ${message}`,
    PLAN_SYSTEM,
  )
  return { type: "plan", plan }
}
