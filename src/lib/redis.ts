import { Redis } from "@upstash/redis"

export const redis = Redis.fromEnv()

export const setResult = (goalId: string, result: unknown) =>
  redis.set(`result:${goalId}`, result)

export const getResult = (goalId: string) => redis.get(`result:${goalId}`)
