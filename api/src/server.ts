import express from 'express'
import cors from 'cors'
import { migrate } from './db'
import { worldsRouter } from './routes/worlds'

/**
 * API do editor de níveis (Fase 3) — draft/publicação do WorldData.
 * Single-user: rotas protegidas por Bearer EDITOR_TOKEN.
 * Logs: método, path, status, ms — nunca headers nem token.
 */
const app = express()

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(
  cors({
    // Sem header Origin (curl/healthcheck) → liberado; origem fora da lista
    // → sem Access-Control-Allow-Origin (o browser bloqueia)
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true)
      else cb(null, false)
    },
    methods: ['GET', 'PUT', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type', 'If-None-Match'],
  })
)

app.use(express.json({ limit: '5mb' }))

// Log de acesso: método, rota, status, duração — sem headers/token
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`)
  })
  next()
})

app.get('/health', (_req, res) => {
  res.type('text').send('ok')
})

app.use(worldsRouter)

// JSON malformado → 400 (não 500)
app.use(
  (err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in (err as object)) {
      res.status(400).json({ error: 'JSON inválido' })
      return
    }
    next(err)
  }
)

// Erro final: 500 genérico — nunca vaza stack trace
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] erro não tratado:', err instanceof Error ? err.message : err)
  res.status(500).json({ error: 'erro interno' })
})

async function main(): Promise<void> {
  if (!process.env.EDITOR_TOKEN) {
    console.warn('[api] AVISO: EDITOR_TOKEN não definido — rotas protegidas respondem 503')
  }
  await migrate()
  const port = Number(process.env.PORT ?? 3001)
  app.listen(port, '0.0.0.0', () => {
    console.log(`[api] ouvindo em http://0.0.0.0:${port} (origens: ${allowedOrigins.join(', ') || 'nenhuma'})`)
  })
}

main().catch((err) => {
  console.error('[api] falha ao subir:', err)
  process.exit(1)
})
