import type { PlannedStep } from "./understand.ts"

export interface StepResult {
  label: string
  ok: boolean
  detail: string
}

export async function executeStep(step: PlannedStep, _serverId: string): Promise<StepResult> {
  return { label: step.label, ok: false, detail: `action not implemented: ${step.action}` }
}
