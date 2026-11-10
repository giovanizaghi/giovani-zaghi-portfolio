# AGENTS.md — guia para agentes de código

Jogo 3D isométrico (Vite + React 19 + three + @react-three/fiber/drei + zustand + yuka).
Todo o código e comentários são em **português** — mantenha esse estilo.

## Verificação

```bash
npm run build   # tsc -b && vite build
npm run lint    # oxlint
npm run dev     # dev server (http://localhost:5173)
```

## Cenas

As cenas são **dados**, não código: `src/data/default-world.json` (validado
por `src/data/worldSchema.ts` → `parseWorld`) contém `scenes`, `dialogues` e
`startScene`. O formato (`WorldData`/`SceneData`/`Entity`) está em
`src/data/world.ts` e é lido pelo `useWorldStore` (`src/store/useWorldStore.ts`).
`SceneId` é `string` — o id da cena é a chave em `world.scenes`.

`Experience.tsx` renderiza a cena atual com `<SceneRenderer scene={scene}/>`
(um `switch` por `entity.type` em `src/components/SceneRenderer.tsx`) dentro
de `Fragment key={`${sceneId}-${worldNonce}`}` — mudar a key remonta o
cenário (Lua de Sangue). O ambiente (céu/luzes) vem de `scene.env` via
`<WorldEnvironment>`; colliders estáticos saem de `computeSceneColliders`
(`src/data/sceneColliders.ts`). Portas/transportes ligam cenas via
`toScene`/`toSpawn` — `spawn` é onde o player aparece (`[x, y, z]`, y sempre 0).

<!-- TODO Fase 4: documentar formato completo -->

### Como adicionar uma cena

1. Adicionar uma entrada em `scenes` do `default-world.json` com `id`,
   `name`, `spawn`, `bounds` (região jogável — `loadGame` valida o
   `playerPos` salvo contra ela), `env` e `entities`.
2. Apontar portas/transportes para ela via `toScene`/`toSpawn`.

## Editor de níveis

`/editor` é um editor standalone com duas visões no mesmo viewport:
mapa 2D top-down (`src/editor/canvas/`) e **visão 3D real com gizmos**
(`src/editor/viewport3d/`, lazy — three/@react-three/componentes do jogo
ficam num chunk separado, carregado só ao alternar com `Tab`/botão).
O chunk base do editor continua **sem** three — não importe nada de
`src/components` ou `useGameStore` em `src/editor/` fora de `viewport3d/`.
O rascunho fica em `localStorage['editor-world-draft']`
(save com debounce de 800 ms; inválido é preservado em
`editor-world-draft-invalid-backup`). "Testar ▶" abre
`/?world=draft&scene=<id>` — nesse modo `useGameStore` **desliga a
persistência** (não lê nem escreve `portfolio-game-save`).

**Modo edição congelado:** `main.tsx` chama `setEditMode(true)` antes de
montar o editor; `isEditMode()` (`src/store/editMode.ts`, módulo folha sem
imports) desliga persistência no `useGameStore` e faz todo `useFrame` de
gameplay + handlers de interação (`tryEnter`/`tryPass`/`tryBoard`) retornarem
cedo — o preview 3D mostra os visuais reais sem nada se mover. **Todo
componente novo com gameplay em `useFrame` deve early-return em
`isEditMode()`**, e todo tipo de entidade novo precisa declarar as
capacidades do gizmo (`gizmo: { y, rotate, scale }`) em `entityDefs.ts`.

- Registro de entidades: `src/editor/entityDefs.ts` (label, glifo, cor,
  `defaults()`, campos do inspector, `normalize`). Canvas/hit-test leem de lá.
- Validação ao vivo: `src/editor/validate.ts` (`parseWorld` + warnings
  semânticos) — erros bloqueiam o "Testar ▶".
- IDs novos: `${cena}:${tipo}:${6 chars}` via `crypto.getRandomValues`.
- Para **adicionar um tipo de entidade**: entrada em `entityDefs.ts` +
  tipo em `world.ts` + validação em `worldSchema.ts` + `case` no
  `SceneRenderer.tsx`.

## Sistema de transportes

Cenas se conectam por **portas** (teleporte instantâneo via `enterScene`) ou
por **transportes** (animação de veículo antes de carregar a cena).

### Arquivos

- `src/data/transports.ts` — tipos (`TransportKind`, `CompassDirection`,
  `TransportRide`, `TransportLink`), `DIRECTION_VECTORS` e
  `TRANSPORT_CONFIG` (label, duração, distâncias por tipo).
- `src/components/Transport.tsx` — modelos low-poly (`VehicleModel`, um
  componente por tipo: `CarModel`, `VanModel`, `BusModel`, `PlaneModel`,
  `ElevatorModel`), `<Transport>` (interativo) e `<ParkedVehicle>`
  (decoração com colliders, sem interação).
- Transportes são entidades `type: 'transport'`/`'parked'` no JSON do mundo,
  renderizadas pelo `SceneRenderer` (5 partidas em `outside` → `terminal`,
  elevador de retorno em `terminal` → `outside`).

### Convenções

- **Direção = eixos do MUNDO**: north = -Z, south = +Z, east = +X,
  west = -X (`DIRECTION_VECTORS`). Nada a ver com a câmera.
- Modelos são construídos "de frente para +Z"; o grupo rotaciona por
  `Math.atan2(dir.x, dir.z)`. O elevador não tem bússola — só `vertical`.
- `TransportRide`: `{ kind: 'elevator', vertical: 'up' | 'down' }` ou
  `{ kind: 'car' | 'van' | 'bus' | 'plane', direction: CompassDirection }`.
- Animações: elevador fecha as portas (~0.5s) e sobe/desce a cabine;
  carro/van/ônibus aceleram (ease-in) na direção até sair da tela;
  avião taxi-a ~35% do tempo e depois escala diagonal ~30° com nariz empinado.

### Ciclo de vida de uma viagem

1. `DoorTarget.transport = { id, ride }` — o `<Transport>` com esse `id`
   registra o `DoorTarget` (com `transport`) no proximity trigger / clique.
2. `interactWithDoor` → `startTransport` guarda `ActiveTransition`
   `{ id, ride, scene, spawn, startedAt }` na store (não é persistida).
3. O `<Transport>` cujo `transition.id === id` anima pelo relógio
   (`performance.now() - startedAt`) — a cena destino **só carrega**
   quando `elapsed >= duration`, via `finishTransport()` → `enterScene`.
4. Durante a viagem: player escondido e parado (a câmera **não** segue o
   veículo — `playerPosition` não muda), input/diálogo/menu/itens/dano/IA
   todos bloqueados (`transition !== null` checado em Player, hooks,
   InteractHint, Companion, Crawler, Flyer e `takeDamage`/`useItem`/`interactWithDoor`).

### Adicionando um transporte

```tsx
<Transport
  id="meu-transporte"              // único na cena
  kind="car"                       // modelo exibido
  position={[-13, 0, 4]}           // centro no chão
  ride={{ kind: 'car', direction: 'east' }}
  scene="terminal"                 // destino
  spawn={[-5.5, 0, -4.0]}          // onde o player aparece lá
/>
```

O `<Transport>` já monta o `DoorTarget` com `transport: { id, ride }` —
não é preciso criar a porta na mão. `ParkedVehicle` é o mesmo modelo
sem interação (plataformas do terminal).

### Trocar os modelos primitivos por GLB

Os veículos são caixas/cilindros low-poly de propósito. Para trocar por
modelos reais, edite **apenas** `VehicleModel` em `src/components/Transport.tsx`
(um `case` por tipo) — os refs de animação (`cabinRef`, `doorLRef`,
`doorRRef`, `pitchRef`) precisam ser repassados ao GLB do elevador/avião.
As dimensões de gameplay ficam em `KIND_DIMS` (mesmo arquivo).

## Terminal Central

É o **único destino** de todos os transportes por enquanto. Tem uma
plataforma por tipo com o veículo estacionado e um elevador de retorno
(`vertical: 'down'`) que leva de volta a `outside`, spawnando ao lado do
elevador de partida em `(-13, 0, 4)`.
