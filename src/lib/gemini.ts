import { GoogleGenAI, type GenerateContentConfig } from "@google/genai"
import { redis } from "./redis.ts"

const KEYS = [
  ...(process.env.GEMINI_API_KEYS ?? process.env.GEMINI_API_KEY ?? "").split(","),
  ...[1, 2, 3, 4].map((n) => process.env[`GEMINI_API_KEY_${n}`] ?? ""),
]
  .map((k) => k.trim())
  .filter(Boolean)
const clients = KEYS.map((apiKey) => new GoogleGenAI({ apiKey }))
let cursor = 0
const failures = new Map<number, number[]>()

export const MODELS = {
  strong: process.env.MODEL_STRONG ?? "gemini-3.8-flash",
  lite: process.env.MODEL_LITE ?? "gemini-3.5-flash-lite",
  support: process.env.MODEL_SUPPORT ?? "gemma-4",
}

const exhausted = (i: number) => `gemini:exhausted:${i}`

const isQuota = (e: unknown) =>
  (e as { status?: number })?.status === 429 ||
  /RESOURCE_EXHAUSTED|quota|rate/i.test(String((e as Error)?.message ?? ""))

async function call(model: string, prompt: string, config: GenerateContentConfig) {
  let last: unknown
  for (let n = 0; n < clients.length; n++) {
    const i = (cursor + n) % clients.length
    if (await redis.exists(exhausted(i))) continue
    cursor = (i + 1) % clients.length
    try {
      const res = await clients[i].models.generateContent({ model, contents: prompt, config })
      failures.delete(i)
      return res.text ?? ""
    } catch (e) {
      if (!isQuota(e)) throw e
      last = e
      const msg = String((e as Error)?.message ?? "")
      const day = new Date()
      const reset = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1)
      const recent = (failures.get(i) ?? []).filter((t) => Date.now() - t < 900_000)
      recent.push(Date.now())
      failures.set(i, recent)
      const retry = Number(/retryDelay["': ]*(\d+)s/.exec(msg)?.[1] ?? 60)
      const daily = /per ?day|RPD/i.test(msg) || recent.length >= 3
      const ttl = daily
        ? Math.max(60, Math.floor((reset - Date.now()) / 1000))
        : Math.min(300, Math.max(60, retry))
      await redis.set(exhausted(i), "1", { ex: ttl })
    }
  }
  throw last ?? new Error("no GEMINI_API_KEYS configured")
}

export async function generate(model: string, prompt: string, system?: string) {
  return call(model, prompt, system ? { systemInstruction: system } : {})
}

export async function generateJson<T>(model: string, prompt: string, system: string): Promise<T> {
  const text = await call(model, prompt, { systemInstruction: system, responseMimeType: "application/json" })
  return JSON.parse(text || "{}") as T
}
