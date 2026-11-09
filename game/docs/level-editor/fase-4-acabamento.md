# Fase 4 — Acabamento: documentação, teste do ciclo completo, hardening

> Pré-requisito: **Fases 1, 2 e 3 concluídas.**
> Resultado esperado: fluxo "criar → testar → salvar no servidor → publicar"
> validado de ponta a ponta, documentado em `AGENTS.md`/`README.md`, e o
> editor com os acabamentos que faltam para o uso diário.

## Objetivo

Fechar as pontas soltas e deixar o sistema pronto para eu montar o jogo só
pelo editor, sem tocar em código para conteúdo.

## Passos

### 1. Documentação

- `AGENTS.md`:
  - Reescrever a seção **Cenas**: cenas agora são `SceneData` no `WorldData`; listar os tipos de `Entity` com uma linha cada; explicar `id` estável e o impacto em `consumedEntities`/`unlockedDoors`.
  - Nova seção **Como adicionar um tipo de entidade** (3 pontos): (1) variante na union em `src/data/world.ts` + schema; (2) `case` no `SceneRenderer`; (3) `EntityDef` em `src/editor/entityDefs.ts` (glifo, cor, campos, defaults).
  - Nova seção **Level editor**: rota, atalhos, fluxo local → servidor → publicar, `?world=draft&scene=`.
  - Nova seção **API** (`api/`): endpoints, envs, como rodar local (`docker compose up`).
  - Atualizar o bloco de verificação com os comandos do `api/` (`npm run build`, `npm run dev`).
- `README.md` do jogo: seção "Deploy" cobrindo os dois serviços Railway; seção "Editor" curta para o uso.
- `api/README.md` curto.
- Remover `scripts/export-world.ts` (ou mover para `scripts/legacy/` com nota) e `src/data/dialogues.ts` se ainda existir.

### 2. Teste do ciclo completo (manual, checklist)

- [ ] Abrir `/editor`, criar cena `caverna` do zero: chão, paredes com colisão, 3 crawlers com `hp` alto, 1 NPC com diálogo novo, 2 moedas, 1 chave prata, porta trancada (prata) levando de volta à floresta.
- [ ] Na floresta, colocar um `door` → `caverna` com `toSpawn` escolhido no mapa.
- [ ] Testar ▶ a partir da floresta: entrar, lutar, pegar chave, abrir porta, voltar. Conferir colisão, hint de interação, diálogo, save do progresso na caverna (`consumedEntities`).
- [ ] Salvar no servidor; fechar aba; reabrir `/editor` em outro navegador; carregar o draft remoto.
- [ ] Publicar. Abrir o jogo em aba anônima → caverna existe.
- [ ] Apagar a caverna no editor, publicar de novo. Abrir o jogo com um save que estava **dentro** da caverna → cai no `startScene` sem travar.
- [ ] Rollback para a versão com caverna → jogo volta a ter a caverna.
- [ ] Derrubar a API (ou `VITE_API_URL` inválida) → jogo abre com cache/bundled.
- [ ] Lua de Sangue, game over, transportes e terminal continuam funcionando com o mundo publicado.

### 3. Hardening e qualidade de vida

- **Editor**
  - Aviso ao sair da página com `dirty` (beforeunload).
  - Mini-mapa de referência: overlay opcional com o `default.json` embutido em cinza para comparar.
  - Busca/filtro de entidades por tipo na cena (lista lateral opcional, clicar centraliza).
  - Marcar entidades cujo `id` já existe na versão publicada: mudar posição é seguro; apagar/trocar id mostra aviso "reseta progresso de jogadores".
  - Atalho `F` = enquadrar seleção; `H` = enquadrar bounds.
- **Jogo**
  - Versão do mundo no `SaveIndicator` ou console para debug (`world v12`).
  - `useGLTF.preload` dinâmico: coletar os modelos usados nas entidades da cena atual em vez de lista fixa.
- **API**
  - Rate limit simples nas rotas autenticadas (ex.: 60 req/min) para evitar brute force de token.
  - `GET /worlds/published` com compressão (`compression` middleware) — o JSON pode passar de 100 KB.
  - Limpeza opcional: manter as últimas N versões (ex.: 50) — só se o banco crescer; por padrão não apagar.
- **Build/CI**
  - Checagem de que `game/src/data/worldSchema.ts` e `api/src/worldSchema.ts` são idênticos (script `npm run check-schema` em ambos, falha o build se divergirem) — ou migrar para workspace `shared/` se isso incomodar.
  - `npm run lint` + `npm run build` nos dois pacotes antes do commit final.

### 4. Commit e deploy finais

- Commits separados por tema (docs, hardening editor, hardening api).
- Verificar deploy dos dois serviços na Railway e o `/health` de cada um.
- Publicar o mundo "oficial" pelo editor e confirmar que o live reflete.

## Critérios de aceite

- [ ] Checklist da seção 2 inteiramente verde.
- [ ] `AGENTS.md` permite a um agente adicionar um tipo de entidade novo sem precisar ler este plano.
- [ ] Nenhum arquivo legado de cenário/diálogo hardcoded no repo.
- [ ] `npm run build` e `npm run lint` passam em `game/` e `api/`.
- [ ] Conteúdo do jogo passa a ser criado **só** pelo editor.
