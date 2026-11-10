import pg from 'pg'
import type { PoolClient } from 'pg'

/**
 * Pool Postgres + migrate() idempotente no boot.
 * DATABASE_URL obrigatória — sem ela a API não sobe (erro claro no log).
 * DATABASE_SSL=true liga ssl com rejectUnauthorized:false (Railway/proxies).
 */
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('[api] DATABASE_URL não definida — configure o ambiente (.env / Railway)')
  process.exit(1)
}

export const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
})

/** Client transacional — BEGIN/COMMIT/ROLLBACK encapsulados */
export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Tabelas do mundo versionado:
 * - `draft`: no máximo 1 linha (índice único parcial) — o rascunho do editor.
 * - `published`: 1 linha por versão; a ativa é a de maior `version`.
 *   UNIQUE em (version) impede duas publicações com o mesmo número.
 * `updated_at` marca a última gravação (draft upsert / qualquer insert).
 */
export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS worlds (
      id         BIGSERIAL PRIMARY KEY,
      kind       TEXT NOT NULL CHECK (kind IN ('draft', 'published')),
      version    INTEGER NOT NULL,
      data       JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  // Bancos criados antes da coluna updated_at ganham ela aqui (idempotente)
  await pool.query(`
    ALTER TABLE worlds
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS worlds_draft_unique
      ON worlds (kind) WHERE kind = 'draft'
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS worlds_published_version
      ON worlds (version) WHERE kind = 'published'
  `)
}
