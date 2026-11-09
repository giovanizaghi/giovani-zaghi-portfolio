# Level Editor — plano geral

Plano em 4 fases para criar um editor de níveis simples do jogo isométrico
(`game/`). Cada fase é um plano independente que **continua** o anterior —
use um arquivo por vez com `/plan`:

| Fase | Arquivo | Entrega | Depende de |
| --- | --- | --- | --- |
| 1 | [fase-1-dados-e-renderer.md](./fase-1-dados-e-renderer.md) | Cenas viram JSON (`WorldData`) + `SceneRenderer` genérico. Jogo idêntico ao atual. | — |
| 2 | [fase-2-editor.md](./fase-2-editor.md) | Rota `/editor`: grid 2D top-down, paleta, inspector, diálogos, salvar local, testar no jogo. | Fase 1 |
| 3 | [fase-3-api-publicacao.md](./fase-3-api-publicacao.md) | Serviço `api/` (Express + Postgres na Railway): salvar draft no servidor, publicar, rollback. Jogo carrega o mundo publicado. | Fase 1 (Fase 2 para a UI) |
| 4 | [fase-4-acabamento.md](./fase-4-acabamento.md) | Docs, teste do ciclo completo, hardening. | Fases 1–3 |

## Decisões já tomadas

- **Backend:** API Node própria na Railway (Express + Postgres). Não usar Supabase nem commits via GitHub.
- **Editor:** rota `/editor` dentro do mesmo app Vite (code-split via `lazy`). Sem app separado.
- **Edição visual:** grid 2D top-down em `<canvas>`; o preview 3D é o **próprio jogo** lendo o draft (`/?world=draft`).
- **Escopo do editor:** posicionar entidades, diálogos de NPC, stats por inimigo, portas/transportes entre cenas, bounds/spawn/luz/chão da cena.
- **Fluxo de persistência:** local por padrão (`localStorage`, automático) → "Salvar no servidor" (draft) → "Publicar" (fica disponível no jogo em produção).
- **Auth:** um único token (`EDITOR_TOKEN`) — editor é single-user.
- **Idioma:** código, comentários e UI em **português** (padrão do repo — ver `game/AGENTS.md`).

## Estado atual (contexto para qualquer fase)

- Stack: Vite + React 19 + three + @react-three/fiber/drei + zustand + yuka. Sem router.
- Cenas hardcoded em componentes: `HouseExterior` + `ForestScenario` + `TransportStation` (`outside`), `HomeScenario` (`house`), `TerminalScenario` (`terminal`). `Experience.tsx` escolhe por `if/else` sobre `scene`.
- `SceneId` é union fixa em `src/store/useGameStore.ts`, com `SCENE_SPAWNS` e `SCENE_BOUNDS`.
- Diálogos em `src/data/dialogues.ts`; stats de inimigos são constantes dentro de `Crawler.tsx` / `Flyer.tsx`.
- Colliders: círculos `{ id, position, radius }` registrados via `registerCollider` num `useEffect`; paredes são amostradas em pontos a cada ~0.55 (`HomeScenario`, `ForestScenario`).
- Deploy: Railway, site estático (Railpack, `RAILPACK_SPA_OUTPUT_DIR=dist`, root `game`). Live: https://game-production-20f4.up.railway.app. Há também `Dockerfile` + `nginx.conf` para rodar em container.
- Verificação: `npm run build` (tsc -b + vite build) e `npm run lint` (oxlint), em `game/`.

## Princípios

1. **Conteúdo é dado, não código.** Toda a Fase 1 existe para isso; o editor só manipula JSON.
2. **Reaproveitar os componentes existentes** (`Crawler`, `Coin`, `Npc`, `LockedDoor`, `Transport`, …). Nada de reescrever gameplay.
3. **O jogo nunca fica sem mapa.** Sempre há fallback para `public/world/default.json` embutido no build.
4. **Simples.** Sem multiusuário, sem upload de GLB, sem gizmo 3D.
