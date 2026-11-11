import type { PlannedStep } from "./understand.ts"

export interface StepResult {
  label: string
  ok: boolean
  detail: string
}

export async function executeStep(step: PlannedStep, serverId: string): Promise<StepResult> {
  try {
    await runAction(step.action, serverId)
    return { label: step.label, ok: true, detail: "done" }
  } catch (err) {
    return { label: step.label, ok: false, detail: String(err) }
  }
}

async function runAction(action: string, serverId: string) {
  const res = await fetch(`${process.env.DISCORD_API_BASE ?? "https://discord.com/api/v10"}/guilds/${serverId}/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: action.slice(0, 90) }),
  })
  if (!res.ok) throw new Error(`discord api ${res.status}`)
}
