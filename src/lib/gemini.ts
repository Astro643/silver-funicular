import { GoogleGenAI } from "@google/genai"

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export const MODELS = {
  strong: process.env.MODEL_STRONG ?? "gemini-3.8-flash",
  lite: process.env.MODEL_LITE ?? "gemini-3.5-flash-lite",
  support: process.env.MODEL_SUPPORT ?? "gemma-4",
}

export async function generate(model: string, prompt: string, system?: string) {
  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: system ? { systemInstruction: system } : undefined,
  })
  return res.text ?? ""
}

export async function generateJson<T>(model: string, prompt: string, system: string): Promise<T> {
  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { systemInstruction: system, responseMimeType: "application/json" },
  })
  return JSON.parse(res.text ?? "{}") as T
}
