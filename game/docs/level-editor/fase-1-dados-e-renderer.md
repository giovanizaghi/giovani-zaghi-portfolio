# Fase 1 — Cenas como dados + `SceneRenderer` genérico

> Pré-requisito: nenhum. Leia `docs/level-editor/README.md` para o contexto geral.
> Resultado esperado: o jogo joga **exatamente igual ao de hoje**, mas as 3 cenas
> vêm de um JSON (`src/data/default-world.json`) renderizado por um único componente.

## Objetivo

Transformar o conteúdo hardcoded (`ForestScenario`, `HomeScenario`,
`TerminalScenario`, `HouseExterior`, `TransportStation`) em um formato de dados
`WorldData` e criar o `SceneRenderer` que monta qualquer cena a partir desse
formato usando os componentes já existentes. É a base de tudo: o editor
(Fase 2) edita esse JSON e a API (Fase 3) armazena/publica esse JSON.

## Arquivos envolvidos

Criar:
- `src/data/world.ts` — tipos `WorldData`, `SceneData`, `Entity` + helpers (`createEmptyScene`, `entityId`).
- `src/data/worldSchema.ts` — validação em runtime (sem dependência nova: escrever validador manual simples, ou adicionar `zod` — se adicionar, usar versão publicada há ≥ 7 dias e documentar em `package.json`). A Fase 3 reutiliza o mesmo schema na API.
- `src/store/useWorldStore.ts` — zustand: `world`, `source: 'bundled' | 'draft' | 'published'`, `setWorld`, `getScene(id)`.
- `src/components/SceneRenderer.tsx` — renderiza `SceneData`.
- `src/components/WorldEnvironment.tsx` — background + luzes a partir de `scene.env`.
- `src/data/default-world.json` — mundo atual exportado.
- `scripts/export-world.ts` — script descartável que gera o JSON acima a partir dos arrays atuais (rodar com `npx tsx` ou `node --experimental-strip-types`; apagar depois ou manter como referência).

Modificar:
- `src/store/useGameStore.ts` — `SceneId` vira `string`; `SCENE_SPAWNS`/`SCENE_BOUNDS` saem e viram lookups em `useWorldStore`; `loadGame` valida cena/bounds via world; `dialogues` lido do world.
- `src/components/Experience.tsx` — troca o `if/else` por `<SceneRenderer>`.
- `src/components/Crawler.tsx`, `src/components/Flyer.tsx` — prop opcional `stats?: { hp?: number; damage?: number; xp?: number }` que sobrescreve `BASE_HP`/`BASE_DAMAGE`/`xpReward` **antes** do `enemyScaling`.
- `src/components/LockedDoor.tsx` — aceitar `toScene`/`toSpawn` (hoje só teleporta na mesma cena) para unificar com a porta de saída da casa.
- `src/components/HouseExterior.tsx` — extrair o GLB da casa + telhado + porta de entrada em um componente `HouseModel` posicionável (`x`, `z`, `rotY`), sem os arrays de decoração (que viram entidades `block`).
- `src/data/dialogues.ts` — manter o conteúdo como **seed** do `default.json`; em runtime, ler de `useWorldStore.getState().world.dialogues`. Ajustar `DialogueBox`, `Npc`, `useGameStore.advanceDialogue`.
- `src/main.tsx` — carregar o mundo (`bundled` por padrão; `?world=draft` lê `localStorage['editor-world-draft']` — já deixar pronto para a Fase 2) antes de montar o `App`.
- `AGENTS.md` — seção "Cenas" passa a descrever o formato JSON (ver Fase 4; aqui só um TODO).

Apagar ao final (depois de validar visualmente):
- `ForestScenario.tsx`, `HomeScenario.tsx`, `TerminalScenario.tsx`, `TransportStation.tsx` e o que sobrar de `HouseExterior.tsx`.

## Schema `WorldData`

```ts
export interface WorldData {
  version: 1
  startScene: string                 // cena inicial de um save novo (hoje 'outside')
  scenes: Record<string, SceneData>
  dialogues: Record<string, Dialogue> // mesmo shape de data/dialogues.ts
}

export interface SceneData {
  id: string
  name: string
  spawn: [number, number, number]              // respawn/fallback (ex-SCENE_SPAWNS)
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } // ex-SCENE_BOUNDS
  env: SceneEnv
  entities: Entity[]
}

export interface SceneEnv {
  background: string                           // '#9fc8d6'
  ground: { color: string; center: [number, number]; size: [number, number]; y?: number }
  hemi: { sky: string; ground: string; intensity: number }
  ambient: number
  sun: { position: [number, number, number]; intensity: number }
}

type Base = { id: string; x: number; z: number; rotY?: number }

export type Entity = Base & (
  | { type: 'tree'; model: 'deciduous' | 'pine'; height: number }
  | { type: 'block'; size: [number, number, number]; color: string; y?: number; collide: boolean; material?: 'basic' | 'standard' }
  | { type: 'label'; text: string }                                   // roomLabels da casa
  | { type: 'house' }                                                  // GLB casa + telhado + porta de entrada
  | { type: 'coin'; value?: number }
  | { type: 'coffee' }
  | { type: 'item'; item: ItemId }
  | { type: 'key'; color: KeyColor }
  | { type: 'crawler'; stats?: EnemyStats }
  | { type: 'flyer'; stats?: EnemyStats }
  | { type: 'npc'; dialogueId: string; color?: string }
  | { type: 'gate'; skill: string; color: string; size?: [number, number, number] }
  | { type: 'door'; toScene: string; toSpawn: [number, number, number]; radius: number; label: string; labelBack?: string; lock?: KeyColor; width?: number; panel?: boolean }
  | { type: 'transport'; kind: TransportKind; ride: TransportRide; toScene: string; toSpawn: [number, number, number]; label?: string }
  | { type: 'parked'; kind: TransportKind; direction: CompassDirection }
  | { type: 'trigger'; radius: number; dialogueId: string; once: boolean }   // JourneyIntroTrigger, ForestExitTrigger
)

export interface EnemyStats { hp?: number; damage?: number; xp?: number }
```

Regras:
- `y` sempre 0 para spawns; blocos usam `y` = metade da altura por padrão (o renderer calcula se omitido).
- `id` é único **dentro do mundo** (prefixo `${sceneId}:${type}:${n}`). Ele alimenta `consumedEntities`, `unlockedDoors`, `transition.id` e os ids dos colliders — **mudar o id de uma entidade publicada reseta o progresso dela** para quem já jogou (documentar).
- O tipo `door` unifica três mecanismos atuais: `ExitDoorTrigger` (casa → outside, sem painel), `LockedDoor` (painel + chave, mesma cena) e a porta de entrada da casa em `HouseExterior`. `panel: false` → só o anel de trigger; `panel: true` → `LockedDoor`.

## Passos

1. **Tipos e store.** Criar `world.ts`, `worldSchema.ts`, `useWorldStore.ts`. `useWorldStore` expõe `getSpawn(sceneId)`, `getBounds(sceneId)`, `hasScene(sceneId)`.
2. **Refatorar `useGameStore.ts`.**
   - `SceneId = string`. Remover `SCENE_SPAWNS`/`SCENE_BOUNDS`; `respawn`, `loadGame` e o estado inicial (`scene`, `playerPosition`) consultam `useWorldStore`.
   - `loadGame`: se `save.scene` não existir no world → cair em `world.startScene` + spawn dela. Manter a validação de bounds.
   - `advanceDialogue` lê `useWorldStore.getState().world.dialogues`.
3. **Props novas nos componentes existentes.**
   - `Crawler`/`Flyer`: `stats` opcional. Dentro do `useMemo` do `ctx`: `hp: (stats?.hp ?? BASE_HP) * scaling.hpMult`, idem dano; `xpReward: stats?.xp ?? scaling.xpReward`.
   - `LockedDoor`: props `toScene?`/`toSpawn?` — quando presentes, o `DoorTarget` aponta para outra cena em vez do lado oposto da mesma porta.
   - Extrair `HouseModel` de `HouseExterior`.
   - Criar `SceneTrigger` genérico (raio + dialogueId + once) a partir de `JourneyIntroTrigger`/`ForestExitTrigger`.
   - Criar `DoorTrigger` genérico (anel + E/clique) a partir de `ExitDoorTrigger`.
4. **`SceneRenderer.tsx`.**
   - `useEffect`: calcula colliders de todas as entidades com colisão (árvore: `height*0.28`; bloco `collide`: amostragem de pontos a cada 0.55 ao longo do maior eixo, raio 0.28, igual ao código atual; altares/pedras: `max(w,d)*0.45` — manter as mesmas fórmulas para o resultado ser idêntico) e registra/desregistra.
   - Render: chão (`env.ground`), `switch(entity.type)` → componente. `Suspense` em volta de GLBs. `useGLTF.preload` das árvores e da casa.
   - `key` de cada entidade = `entity.id`.
5. **`WorldEnvironment.tsx`** com `<color attach="background">`, `hemisphereLight`, `ambientLight`, `directionalLight` (manter os valores atuais de sombra).
6. **`Experience.tsx`**: `<WorldEnvironment env={scene.env} />` + `<Fragment key={`${sceneId}-${worldNonce}`}><SceneRenderer scene={scene} /></Fragment>`. Player/Companion/etc. ficam como estão.
7. **`scripts/export-world.ts`**: importar os arrays atuais (`trees`, `stones`, `path`, `altars`, `vaultWalls`, `walls`, `furniture`, `roomLabels`, plataformas do terminal, transportes da estação, etc.) e emitir `default.json`. Para itens que estão só em JSX (`<Coin position=…>`, `<Crawler>`, `<CoffeeCup>`…), transcrever manualmente no script. Garantir que os ids batam com os atuais onde eles importam para saves existentes (`forest-vault`, ids de transporte `*-station`, `consumedId` de inimigos/moedas — conferir como cada componente monta o id hoje e preservar o formato ou aceitar o reset com uma nota no commit).
8. **`main.tsx`**: `await loadWorld()` → `bundled` (`import` do JSON embutido, sem depender de rede) → `createRoot`. Já suportar `?world=draft` (localStorage).
9. **Validação visual**: rodar `npm run dev`, percorrer as 3 cenas comparando com a versão anterior (tirar screenshots antes do refactor para comparar). Testar: colisão nas paredes da casa e do cofre, porta do cofre com chave, saída da casa, entrada na casa, todos os 5 transportes → terminal → elevador de volta, Lua de Sangue (remount), game over → respawn, save/load.
10. **Apagar os componentes de cenário antigos**, `npm run build`, `npm run lint`.

## Critérios de aceite

- [ ] `npm run build` e `npm run lint` passam.
- [ ] As 3 cenas são visualmente iguais às anteriores (mesmas posições, cores, colliders).
- [ ] Nenhum componente de cenário hardcoded sobra em `src/components`.
- [ ] `SceneId` é `string`; adicionar uma cena = adicionar uma entrada no JSON (sem tocar em TS).
- [ ] `Crawler`/`Flyer` aceitam `stats`; `LockedDoor` aceita destino em outra cena.
- [ ] `?world=draft` carrega um mundo do `localStorage` (preparação para a Fase 2).
- [ ] Save antigo (`portfolio-game-save`) continua carregando sem travar o player.

## Riscos e decisões

- **Fidelidade da migração**: o `HouseExterior` tem lógica própria (GLB, telhado, porta). Vira o tipo `house` + entidade `door` para a porta. Confirmar escala/offset.
- **Ids de progresso**: ver passo 7. Aceitável resetar o progresso de entidades neste commit, desde que o save não quebre.
- **`dialogues` em dois lugares**: só o `default.json` é fonte de verdade depois desta fase; `data/dialogues.ts` pode ser removido após o export.
