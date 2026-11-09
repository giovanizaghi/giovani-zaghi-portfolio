# Fase 3 — API na Railway: salvar no servidor, publicar, jogo lê o publicado

> Pré-requisito: **Fase 1 concluída** (formato `WorldData` + `worldSchema`).
> A Fase 2 é necessária só para ligar os botões da UI — a API em si pode ser
> feita em paralelo.
> Resultado esperado: no editor, "Salvar no servidor" guarda um draft na nuvem,
> "Publicar" o torna a versão ativa; o jogo em produção carrega a versão
> publicada (com fallback para o JSON embutido). Rollback disponível.

## Objetivo

Um serviço HTTP mínimo (Express + Postgres) rodando como **segundo serviço**
no mesmo projeto Railway do jogo. Single-user: um token secreto. Sem
multiusuário, sem contas.

## Estrutura

Criar `api/` na raiz do repo (irmão de `game/`):

```
api/
  package.json           # express, pg, cors, zod (schema), tsx/typescript para dev
  tsconfig.json
  Dockerfile             # node:22-alpine, npm ci, build tsc, CMD node dist/server.js
  src/
    server.ts            # app + listen(process.env.PORT ?? 3001)
    db.ts                # Pool pg + migrate() na inicialização (CREATE TABLE IF NOT EXISTS)
    auth.ts              # middleware Bearer EDITOR_TOKEN (comparação em tempo constante)
    worldSchema.ts       # mesmo schema da Fase 1 (zod). Ver "Compartilhar schema" abaixo
    routes/worlds.ts
  .env.example
```

Modificar:
- `game/docker-compose.yml` — adicionar serviços `api` e `postgres` para desenvolvimento local.
- `game/src/main.tsx` — carregar mundo publicado da API antes do bundled.
- `game/src/editor/*` — ligar botões Salvar servidor / Publicar / Rollback (se Fase 2 pronta).
- `game/.env.example` — `VITE_API_URL=`.
- `game/README.md` — seção de deploy do `api/`.

## Banco

```sql
CREATE TABLE IF NOT EXISTS worlds (
  id         BIGSERIAL PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('draft', 'published')),
  version    INTEGER NOT NULL,         -- incrementa a cada publish; draft usa 0
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS worlds_draft_unique ON worlds (kind) WHERE kind = 'draft';
CREATE INDEX IF NOT EXISTS worlds_published_version ON worlds (version DESC) WHERE kind = 'published';
```

- Draft: uma única linha (upsert).
- Published: uma linha por versão; a "ativa" é a de maior `version`. Rollback = inserir nova versão com `data` da versão antiga (histórico nunca é reescrito).

## Endpoints

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| GET | `/health` | — | `ok` (Railway healthcheck) |
| POST | `/auth/check` | Bearer | 204 se o token é válido (UX de login no editor) |
| GET | `/worlds/draft` | Bearer | draft atual ou 404 |
| PUT | `/worlds/draft` | Bearer | valida com schema, upsert. Retorna `{ savedAt }` |
| POST | `/worlds/publish` | Bearer | copia draft → nova `published` (version+1). Retorna `{ version, publishedAt }`. 409 se não há draft |
| GET | `/worlds/published` | — | **público**. `{ version, publishedAt, data }`. Headers: `ETag: "v<version>"`, `Cache-Control: public, max-age=60`; responde 304 a `If-None-Match` |
| GET | `/worlds/versions` | Bearer | lista `[ { version, publishedAt, sceneCount } ]` |
| POST | `/worlds/rollback/:version` | Bearer | publica nova versão com o `data` da versão indicada |

Regras:
- Body limit 5 MB (`express.json({ limit })`).
- CORS: `origin` = `ALLOWED_ORIGINS` (lista separada por vírgula: URL do jogo na Railway + `http://localhost:5173`).
- Erros em JSON `{ error: string, details? }`; validação falha → 400 com os issues do schema.
- Log mínimo (método, rota, status, ms). Nunca logar o token.

## Variáveis de ambiente

API (Railway → serviço `api`):
- `DATABASE_URL` — injetada pelo plugin Postgres.
- `EDITOR_TOKEN` — segredo longo (gerar com `openssl rand -hex 32`).
- `ALLOWED_ORIGINS`.
- `PORT` — injetada pela Railway.

Jogo (Railway → serviço `game`):
- `VITE_API_URL` — URL pública do serviço `api` (sem barra final). Vazia → jogo usa só o bundled.

## Compartilhar schema entre `game/` e `api/`

Opção simples (recomendada): manter `worldSchema.ts` em `game/src/data/` como fonte, e em `api/` um script `npm run sync-schema` que copia o arquivo (ou um symlink commitado não funciona bem no Docker). Alternativa: workspace npm na raiz com pacote `shared/` — mais correto, porém muda o build da Railway (root directory). Decidir no início da fase; default = cópia + script de sync + checagem no CI/build de que os arquivos são iguais.

## Passos

1. **Scaffold `api/`**: package.json, tsconfig, Express com `/health`, Dockerfile. Rodar local com `npm run dev` (tsx watch).
2. **DB**: `db.ts` com `Pool` e `migrate()` idempotente executado no boot.
3. **Auth** middleware + `POST /auth/check`.
4. **Rotas de worlds** conforme tabela; validação com o schema compartilhado.
5. **docker-compose local**: `postgres:16-alpine` + `api` (build `../api`) + `game`. `.env.example` em ambos.
6. **Jogo — carregamento**: em `main.tsx`, ordem de prioridade:
   1. `?world=draft` → localStorage (modo teste do editor);
   2. `VITE_API_URL` definido → `fetch(`${API}/worlds/published`)` com timeout de ~4 s; valida com schema; cacheia em `localStorage['world-published']` `{ version, data }` para abrir offline/rápido na próxima vez (usar `If-None-Match`);
   3. fallback: `default.json` embutido.
   Guardar `source` e `version` no `useWorldStore`. Mostrar nada ao jogador (silencioso) — no máximo um log.
7. **Jogo — compatibilidade de save**: gravar `worldVersion` no save. No `loadGame`, se a cena salva não existir, cair em `startScene`. Se existir mas o spawn salvo estiver fora dos bounds novos, cair no spawn da cena (já acontece).
8. **Editor — integração** (`src/editor/api.ts`): `checkToken`, `getDraft`, `putDraft`, `publish`, `listVersions`, `rollback`. Token guardado em `sessionStorage` (pedido numa tela de login quando o usuário clica num botão remoto pela primeira vez).
   - **Salvar no servidor**: `putDraft(world)`; status na barra ("salvo no servidor às 14:03").
   - Ao abrir o editor: se houver draft remoto mais novo que o local (comparar `updatedAt` guardado no draft local), perguntar qual usar.
   - **Publicar**: bloqueia se validação local falhar; `confirm` mostrando diff resumido (nº de cenas/entidades, versão atual → próxima); chama `putDraft` e depois `publish`. Mostra a versão e link para o jogo.
   - **Versões**: modal com a lista e botão "Restaurar esta versão" (rollback) — com confirm.
9. **Deploy Railway**:
   - Novo serviço a partir do repo, Root Directory `api`, builder Dockerfile; adicionar plugin Postgres; setar envs; healthcheck `/health`.
   - No serviço `game`: `VITE_API_URL`. Redeploy.
   - Testar CORS a partir do domínio público.
10. **Teste ponta a ponta**: editor → salvar servidor → publicar → abrir jogo em aba anônima → mundo novo carregado; rollback → recarregar → versão anterior.

## Critérios de aceite

- [ ] `curl $API/health` → `ok`; `GET /worlds/published` público com ETag/304.
- [ ] Rotas protegidas retornam 401 sem token e 200 com token.
- [ ] Payload inválido → 400 com detalhes; payload válido salvo em JSONB.
- [ ] Publicar cria versão nova sem apagar as anteriores; rollback funciona.
- [ ] Jogo em produção carrega o mundo publicado; com a API fora do ar, carrega o cache local ou o bundled sem travar.
- [ ] Save antigo do jogador continua funcionando após publicar um mundo com cenas renomeadas.
- [ ] Nenhum segredo commitado; `.env.example` em `api/` e `game/`.

## Riscos

- **Custo Railway**: Postgres + 1 serviço extra. Alternativa sem banco (JSON em volume) foi descartada por fragilidade; manter Postgres.
- **Cache do navegador**: `max-age=60` + ETag é suficiente; se precisar forçar, o jogo pode usar `?v=<version>` no fetch.
- **Latência no boot do jogo**: timeout de 4 s + cache local garantem que a abertura não fique presa.
