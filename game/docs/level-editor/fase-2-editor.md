# Fase 2 — Editor em `/editor` (grid 2D + inspector + diálogos + salvar local)

> Pré-requisito: **Fase 1 concluída** — `WorldData`/`SceneData`/`Entity` em
> `src/data/world.ts`, `SceneRenderer`, `useWorldStore`, `src/data/default-world.json`
> e suporte a `?world=draft` no `main.tsx`.
> Resultado esperado: em `http://localhost:5173/editor` eu crio/edito cenas e
> diálogos num grid 2D, salvo localmente (automático) e testo no jogo real.
> "Salvar no servidor" e "Publicar" ficam como botões desabilitados até a Fase 3.

## Objetivo

Um editor **simples** e suficiente para montar o jogo inteiro com o que já
existe: posicionar entidades, ajustar parâmetros por formulário, criar cenas,
ligar portas/transportes entre cenas, editar diálogos. Sem libs novas de UI —
CSS puro seguindo o estilo de `src/ui/`.

## Arquivos

Criar em `src/editor/`:
- `EditorApp.tsx` — layout raiz (toolbar / paleta / canvas / inspector).
- `useEditorStore.ts` — zustand: `world`, `currentSceneId`, `selection: string[]`, `tool: 'select' | EntityType`, `camera: { x, z, zoom }`, `dirty`, `history: { past: WorldData[]; future: WorldData[] }`, `remote: { status, lastSavedAt, publishedVersion }` (preenchido na Fase 3).
- `canvas/MapCanvas.tsx` — `<canvas>` 2D com draw loop (`requestAnimationFrame` só quando dirty) e handlers de mouse/teclado.
- `canvas/draw.ts` — funções puras de desenho: grid, bounds, spawn, cada tipo de entidade (glifo + cor), seleção, hover.
- `canvas/hitTest.ts` — picking (ponto → entidade), considerando `size` real de blocos e raio de portas/triggers.
- `panels/Toolbar.tsx` — select de cena, `+ cena`, duplicar/renomear/apagar cena, Salvar local, Salvar servidor (disabled), Publicar (disabled), Testar ▶, Exportar/Importar JSON, Undo/Redo.
- `panels/Palette.tsx` — abas **Entidades** (lista de tipos) e **Diálogos**.
- `panels/Inspector.tsx` — formulário da seleção (entidade) ou da cena (quando nada selecionado).
- `panels/DialoguesPanel.tsx` — CRUD de `world.dialogues`.
- `panels/fields.tsx` — inputs reutilizáveis: `NumberField`, `ColorField`, `SelectField`, `Vec3Field`, `TextField`.
- `entityDefs.ts` — **registro único por tipo**: `{ type, label, defaults(), glyph, color, fields: FieldDef[] }`. Paleta, inspector e canvas leem daqui → adicionar um tipo novo é um item nesta lista + um `case` no `SceneRenderer`.
- `draft.ts` — `loadDraft()`, `saveDraft(world)` (localStorage `editor-world-draft`, debounce 800 ms), `exportJson`, `importJson`.
- `editor.css`.
- `PasswordGate.tsx` — pede `VITE_EDITOR_PASSWORD` (só esconde a UI; segurança real = token da API na Fase 3). Se a env não existir, libera direto (dev).

Modificar:
- `src/main.tsx` — se `location.pathname.startsWith('/editor')`: `lazy(() => import('./editor/EditorApp'))` dentro de `Suspense`; senão, fluxo normal do jogo. Não adicionar react-router.
- `vite.config.ts` — nada obrigatório (`index.html` já atende SPA; nginx tem `try_files`). Opcional: `build.rollupOptions.output.manualChunks` para isolar o chunk `editor`.
- `.env.example` — `VITE_EDITOR_PASSWORD=`.

## UI

```
┌ Toolbar: [cena ▾][+][⧉][✎][🗑]   [↶][↷]   [Salvar local ✓][Salvar servidor][Publicar]   [Testar ▶]  [Exportar][Importar] ┐
├──────────────┬────────────────────────────────────────────────┬───────────────────────────────┤
│ Paleta       │ MapCanvas (top-down, x→direita, z→baixo)       │ Inspector                      │
│ ▸ Entidades  │  grid 0.5 (snap), eixos, bounds (retângulo),   │ Entidade selecionada:         │
│   árvore     │  spawn (★), entidades com glifo/cor,           │  type, id (ro), x, z, rotY,   │
│   bloco      │  portas/transportes com seta → cena destino    │  campos por tipo…             │
│   moeda      │                                                │  [Duplicar] [Apagar]          │
│   …          │  mouse: click coloca (tool≠select) / seleciona │ Sem seleção → Cena:           │
│ ▸ Diálogos   │  drag move; shift+click multi; drag vazio =    │  name, spawn, bounds, env     │
│              │  box-select; roda = zoom; botão do meio = pan   │  (cores, chão, luzes)         │
│              │  Del apaga; R gira 90°; Ctrl+D duplica;         │                               │
│              │  Ctrl+Z/Y; Esc volta p/ select; G grid on/off   │                               │
└──────────────┴────────────────────────────────────────────────┴───────────────────────────────┘
status bar: coords do mouse (x, z) · N entidades · draft salvo há Xs · versão publicada (fase 3)
```

Convenções (iguais ao jogo, ver `AGENTS.md`): norte = -Z (cima no canvas), sul = +Z, leste = +X (direita).

## Passos

1. **Bootstrap**: `main.tsx` com o branch `/editor`; `EditorApp` vazio com layout CSS grid; `PasswordGate`.
2. **Store + draft**: `useEditorStore` carrega `loadDraft() ?? bundled default.json`. Toda mutação passa por `commit(mutator)` que empilha snapshot em `history.past` (limitar a 100) e marca `dirty` → `saveDraft` com debounce. Undo/redo trocam snapshots.
3. **`entityDefs.ts`**: um `EntityDef` por tipo do `Entity` union (tree, block, label, house, coin, coffee, item, key, crawler, flyer, npc, gate, door, transport, parked, trigger). `fields` descreve o formulário: `{ key, label, kind: 'number' | 'color' | 'select' | 'vec3' | 'text' | 'bool' | 'scene' | 'dialogue' | 'spawnPicker', min?, max?, step?, options? }`. `defaults()` gera a entidade inicial (ex.: bloco `size [1, 1, 1]`, `collide true`).
4. **MapCanvas — desenho**: world→screen com `camera`; grid, bounds, spawn, entidades por `def.glyph`/`def.color`. Blocos desenham retângulo `size[0] × size[2]` rotacionado por `rotY`; árvores círculo com raio do collider; portas/triggers o raio; transportes/portas uma seta tracejada para o label da cena destino. Seleção com contorno.
5. **MapCanvas — interação**: hit test, colocar, mover (snap 0.5; Alt desliga snap), multi-seleção, box-select, pan/zoom, atalhos. Mover várias entidades mantém offsets. Arrastar o ★ muda `spawn`; arrastar bordas do retângulo muda `bounds`.
6. **Inspector**: gera o form a partir de `def.fields`. Campos especiais:
   - `scene`: select das cenas do world.
   - `dialogue`: select de `world.dialogues` + botão "editar" que abre a aba Diálogos.
   - `spawnPicker` (`toSpawn`): botão "escolher no mapa" → troca para a cena destino com um cursor de mira; o click grava `toSpawn` e volta. Também aceita digitar.
   - Inimigos: seção "Stats (override)" com hp/damage/xp opcionais e placeholder mostrando o base.
   - Mostrar aviso quando o `id` já foi publicado (Fase 3) — por ora, o `id` é read-only e gerado em `defaults()` como `${sceneId}:${type}:${nanoid curto}` (implementar gerador simples sem dependência).
7. **Painel da cena** (sem seleção): name, id (ro), spawn, bounds, `env` completo; botão "centralizar câmera nos bounds".
8. **Gestão de cenas** na Toolbar: criar (`createEmptyScene(id, name)` com env padrão igual ao `outside`), duplicar, renomear, apagar (bloquear se outra cena aponta pra ela via door/transport — listar as referências). Definir `startScene`.
9. **DialoguesPanel**: lista; criar/renomear id/apagar (bloquear apagar se algum `npc`/`trigger` usa); editar `name`; `lines` com textarea por linha + adicionar/remover/mover ↑↓.
10. **Validação ao vivo**: rodar `worldSchema` + checagens semânticas (door/transport apontando pra cena inexistente, `toSpawn` fora dos bounds do destino, dialogueId inexistente, ids duplicados, spawn fora dos bounds). Mostrar na status bar e marcar entidades em vermelho no canvas. "Testar" e (Fase 3) "Publicar" bloqueiam com erros.
11. **Testar ▶**: `saveDraft()` imediato e `window.open('/?world=draft&scene=<currentSceneId>', 'game-preview')`. No jogo, `?scene=` força `enterScene` naquela cena no spawn dela e **ignora o save** (`loadGame` pulado, para o teste ser limpo) — ajustar `main.tsx`/`loadGame` para esse modo.
12. **Exportar/Importar JSON**: download do `WorldData`; importar valida com `worldSchema` e substitui o draft (com confirm).
13. `npm run build` (conferir que o chunk do editor não entra no bundle inicial do jogo), `npm run lint`.

## Critérios de aceite

- [ ] `/editor` abre sem afetar o bundle inicial de `/` (verificar no output do `vite build`).
- [ ] Consigo criar uma cena nova, colocar chão/paredes/inimigos/NPC, ligar uma porta da floresta até ela com spawn escolhido no mapa, e **jogar** isso via Testar ▶.
- [ ] Editar um diálogo e ver a mudança no jogo via Testar ▶.
- [ ] Fechar a aba e reabrir `/editor` mantém o draft (localStorage).
- [ ] Undo/redo, multi-seleção, duplicar, apagar, snap funcionam.
- [ ] Validação impede referências quebradas (cena/diálogo inexistente).
- [ ] Botões "Salvar no servidor"/"Publicar" existem, desabilitados com tooltip "Fase 3".

## Visão 3D (gizmos)

O viewport alterna entre o mapa 2D e uma **cena 3D real** (botão "3D/2D" na
toolbar ou `Tab`). A visão 3D é lazy-loaded (`src/editor/viewport3d/`) —
three/@react-three ficam fora do chunk base do editor.

- Renderiza a cena com os mesmos componentes do jogo (`EntityView`,
  `WorldEnvironment`, `SceneGround` exportados de `SceneRenderer.tsx`),
  mas **congelada**: `src/store/editMode.ts` liga `isEditMode()` no
  `main.tsx` antes do editor montar; todo `useFrame` de gameplay e todo
  handler de interação (`tryEnter`/`tryPass`/`tryBoard`) retorna cedo, e
  `useGameStore` desliga a persistência (`PERSISTENCE_OFF`).
- Câmera: `PerspectiveCamera` + `OrbitControls` (drei, `makeDefault`).
  Ao entrar/trocar de cena enquadra os `bounds`; `F` enquadra a seleção.
- Seleção por clique (Shift = multi), helpers: círculo de trigger,
  wireframe de bloco invisível, marcador de label, spawn ★, bounds,
  marcador de `toSpawn` na mesma cena. Entidades com erro de validação (ou
  que quebram o render, via error boundary) viram caixa wireframe vermelha.
- **Gizmos** (`TransformControls` do drei num `Object3D` proxy na entidade
  primária — última da seleção): `G` mover, `R` rotacionar, `S` escalar
  (só na visão 3D; no 2D `G`/`R` mantêm o significado antigo). Botões
  equivalentes na toolbar. Capacidades por tipo em `entityDefs.gizmo`
  (`{ y, rotate, scale }`): `y` = handle vertical, `rotate` = aro Y
  (porta só com `panel: true`), `scale` = só bloco (edita `size`, mín. 0.1).
- Snap: translação 0.5, rotação 15°, escala 0.25 — `Alt` desliga (como no 2D).
- Undo: `onMouseDown`→`beginEdit`, `onObjectChange`→`editLive`,
  `onMouseUp`→`endEdit` — um passo de undo por drag. Translação move todas
  as selecionadas pelo mesmo delta; rotação/escala só na primária. `y` só é
  escrito quando o usuário arrasta no eixo Y; `rotY` fica em (−π, π].
- O mapa 2D desenha `rotY` como o three vê de cima (x→direita, z→baixo =
  R(−rotY)) — a matemática de `draw.ts`/`hitTest.ts` foi corrigida para
  bater com `rotation.y` em qualquer ângulo.

## Fora do escopo desta fase

- Qualquer chamada de rede (Fase 3).
- Upload de modelos GLB.
