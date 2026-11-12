import { serve } from "@hono/node-server"
import { app } from "./app.ts"

const port = Number(process.env.PORT) || 8080
serve({ fetch: app.fetch, port }, (info) => {
  console.log("server: listening on port", info.port)
})
