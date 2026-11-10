import { Router } from 'express'
import type { Request, Response } from 'express'
import { pool, withTx } from '../db'
import { requireToken } from '../auth'
import { parseWorld } from '../shared/worldSchema'
import type { WorldData } from '../shared/world'

/**
 * Rotas do mundo versionado:
 * - draft: 1 linha (upsert) — rascunho do editor, nunca público.
 * - published: 1 linha por versão — a ativa é a de maior `version`;
 *   rollback insere uma NOVA versão com dados antigos (histórico intacto).
 */
export const worldsRouter = Router()

// Trava de publicação — serializa publish/rollback na mesma chave
const PUBLISH_LOCK = 727272001

worldsRouter.post('/auth/check', requireToken, (_req, res) => {
  res.status(204).end()
})

worldsRouter.get('/worlds/draft', requireToken, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT data, updated_at FROM worlds WHERE kind = 'draft'`
    )
    if (r.rowCount === 0) {
      res.status(404).json({ error: 'sem rascunho' })
      return
    }
    res.json({ data: r.rows[0].data as WorldData, updatedAt: r.rows[0].updated_at })
  } catch (err) {
    next(err)
  }
})

worldsRouter.put('/worlds/draft', requireToken, async (req, res, next) => {
  try {
    const parsed = parseWorld(req.body)
    if (!parsed.ok) {
      res.status(400).json({ error: 'mundo inválido', details: parsed.errors })
      return
    }
    const r = await pool.query(
      `INSERT INTO worlds (kind, version, data, updated_at)
       VALUES ('draft', 0, $1, now())
       ON CONFLICT (kind) WHERE kind = 'draft'
       DO UPDATE SET data = EXCLUDED.data, updated_at = now()
       RETURNING updated_at`,
      [JSON.stringify(parsed.world)]
    )
    res.json({ savedAt: r.rows[0].updated_at })
  } catch (err) {
    next(err)
  }
})

worldsRouter.post('/worlds/publish', requireToken, async (_req, res, next) => {
  try {
    const outcome = await withTx(async (client) => {
      // Serializa publicações concorrentes
      await client.query('SELECT pg_advisory_xact_lock($1)', [PUBLISH_LOCK])
      const draft = await client.query(
        `SELECT data FROM worlds WHERE kind = 'draft'`
      )
      if (draft.rowCount === 0) return { code: 409 as const }
      const parsed = parseWorld(draft.rows[0].data)
      if (!parsed.ok) return { code: 400 as const, errors: parsed.errors }
      const max = await client.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS v
         FROM worlds WHERE kind = 'published'`
      )
      const version: number = max.rows[0].v
      const ins = await client.query(
        `INSERT INTO worlds (kind, version, data, updated_at)
         VALUES ('published', $1, $2, now())
         RETURNING version, created_at`,
        [version, JSON.stringify(parsed.world)]
      )
      return {
        code: 200 as const,
        version: ins.rows[0].version as number,
        publishedAt: ins.rows[0].created_at,
      }
    })
    if (outcome.code === 409) {
      res.status(409).json({ error: 'não há rascunho para publicar' })
    } else if (outcome.code === 400) {
      res.status(400).json({ error: 'rascunho inválido', details: outcome.errors })
    } else {
      res.json({ version: outcome.version, publishedAt: outcome.publishedAt })
    }
  } catch (err) {
    next(err)
  }
})

// Público — o jogo busca esta rota sem token (com ETag/304)
worldsRouter.get('/worlds/published', async (req: Request, res, next) => {
  try {
    const r = await pool.query(
      `SELECT version, created_at, data FROM worlds
       WHERE kind = 'published' ORDER BY version DESC LIMIT 1`
    )
    if (r.rowCount === 0) {
      res.status(404).json({ error: 'nada publicado ainda' })
      return
    }
    const row = r.rows[0]
    const etag = `"v${row.version}"`
    res.set('ETag', etag)
    res.set('Cache-Control', 'public, max-age=60')
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end()
      return
    }
    res.json({
      version: row.version as number,
      publishedAt: row.created_at,
      data: row.data as WorldData,
    })
  } catch (err) {
    next(err)
  }
})

worldsRouter.get('/worlds/versions', requireToken, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT version, created_at,
              (SELECT count(*)::int FROM jsonb_object_keys(data -> 'scenes')) AS scene_count
       FROM worlds WHERE kind = 'published' ORDER BY version DESC`
    )
    res.json(
      r.rows.map((row) => ({
        version: row.version as number,
        publishedAt: row.created_at,
        sceneCount: row.scene_count as number,
      }))
    )
  } catch (err) {
    next(err)
  }
})

worldsRouter.post(
  '/worlds/rollback/:version',
  requireToken,
  async (req: Request, res, next) => {
    try {
      const param = String(req.params.version)
      const target = Number(param)
      if (!/^\d+$/.test(param) || !Number.isSafeInteger(target) || target <= 0) {
        res.status(400).json({ error: 'versão inválida' })
        return
      }
      const outcome = await withTx(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock($1)', [PUBLISH_LOCK])
        const src = await client.query(
          `SELECT data FROM worlds WHERE kind = 'published' AND version = $1`,
          [target]
        )
        if (src.rowCount === 0) return { code: 404 as const }
        const max = await client.query(
          `SELECT COALESCE(MAX(version), 0) + 1 AS v
           FROM worlds WHERE kind = 'published'`
        )
        const version: number = max.rows[0].v
        const ins = await client.query(
          `INSERT INTO worlds (kind, version, data, updated_at)
           VALUES ('published', $1, $2, now())
           RETURNING version, created_at`,
          [version, JSON.stringify(src.rows[0].data)]
        )
        return {
          code: 200 as const,
          version: ins.rows[0].version as number,
          publishedAt: ins.rows[0].created_at,
        }
      })
      if (outcome.code === 404) {
        res.status(404).json({ error: `versão ${target} não encontrada` })
      } else {
        res.json({ version: outcome.version, publishedAt: outcome.publishedAt })
      }
    } catch (err) {
      next(err)
    }
  }
)
