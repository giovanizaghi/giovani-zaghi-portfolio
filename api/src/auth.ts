import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

/**
 * Auth single-user: `Authorization: Bearer <EDITOR_TOKEN>`.
 * Comparação em tempo constante sobre os digests SHA-256 (mesmo tamanho,
 * imune a timing attack e a tokens de comprimento diferente).
 * Sem EDITOR_TOKEN configurado → 503 em todas as rotas protegidas (fail closed).
 */
export function requireToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.EDITOR_TOKEN
  if (!expected) {
    res.status(503).json({ error: 'EDITOR_TOKEN não configurado' })
    return
  }
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  const a = createHash('sha256').update(token).digest()
  const b = createHash('sha256').update(expected).digest()
  if (!timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'não autorizado' })
    return
  }
  next()
}
