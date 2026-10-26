# Isometric RPG — Three.js + React Three Fiber

Jogo 3D isométrico estilo RPG: personagem GLB animado andando pelo mapa, câmera
ortográfica que o segue, e interação com NPCs via diálogos com efeito typewriter.

## Stack

- **Vite** + React 19 + TypeScript
- **three** + **@react-three/fiber** (render / game loop)
- **@react-three/drei** (câmera, `useGLTF`, `useAnimations`, `KeyboardControls`)
- **zustand** (estado do jogo: diálogo, interação, posição do player)
- **yuka** (IA dos inimigos: FSM + steering behaviors seek/wander)

## Como rodar

```bash
npm install
npm run dev
```

Abra http://localhost:5173

## Deploy (Railway)

**Live:** https://game-production-20f4.up.railway.app

Deploy como site estático na Railway (Railpack detecta o Vite e serve `dist/` com Caddy). Cada push na `main` dispara um novo deploy.

Configuração do serviço (feita no painel/API, não em arquivo — `railway.json` foi descontinuado pela Railway):

- **Root Directory:** `game`
- **Variável:** `RAILPACK_SPA_OUTPUT_DIR=dist`
- **Healthcheck:** `/health` (respondido pelo Caddy do Railpack)
- **Restart policy:** ON_FAILURE, 3 tentativas

## Controles

| Tecla | Ação |
| --- | --- |
| `WASD` / setas | Mover o personagem (relativo à câmera) |
| `Shift` (segurar) | Correr |
| `E` | Falar com NPC / avançar fala |
| `Espaço` | Ataque do orbe (rastro de cometa de `0`/`1`) |
| `1`–`4` | Usar item do hotbar (Java / C# / JS / Python) |
| `Tab` | Menu de inventário (itens + personagem 3D em idle) |
| `Esc` | Fechar diálogo |
| Clique na caixa | Completar fala / avançar |

## Modelos GLB

O personagem (Meshy AI) está em `public/assets/models/` — modelo base + animações
em arquivos separados, mescladas em `src/components/Player.tsx`
(`MODEL_URL` / `ANIMATION_URLS`). Detalhes em `public/assets/models/README.md`.
Escala do modelo: constante `MODEL_SCALE` no `Player.tsx`.

## Estrutura

```
src/
├── components/
│   ├── Experience.tsx   # cena: luzes, câmera, chão, player, NPCs
│   ├── IsoCamera.tsx    # câmera ortográfica isométrica (segue o player)
│   ├── Player.tsx       # GLB + animações idle/walk + movimento
│   ├── Companion.tsx    # orbe companheiro (estilo Ori) + ataque de dígitos
│   ├── ItemEffects.tsx  # efeitos de mundo dos itens (explosão, cobra)
│   ├── Crawler.tsx      # inimigo rastejante (FSM yuka: wander→chase→bote)
│   ├── ItemPickup.tsx   # item coletável flutuante
│   ├── Coin.tsx         # moeda coletável (compra slots)
│   ├── Npc.tsx          # NPC com detecção de proximidade
│   └── Ground.tsx       # chão e decoração do mapa
├── ui/
│   ├── DialogueBox.tsx  # caixa de diálogo com typewriter
│   ├── Hotbar.tsx       # barra de itens (teclas 1–4) + compra de slots
│   ├── InventoryMenu.tsx# menu Tab: itens + preview 3D do personagem
│   └── InteractHint.tsx # "E — Falar com ..."
├── components/CharacterPreview.tsx # clone do GLB em idle (menu BOTW-style)
├── fx/particles.tsx     # pool global de partículas 0/1 (emitBinary)
├── store/useGameStore.ts# zustand
├── data/dialogues.ts    # falas por NPC
├── data/stats.ts        # stats, curva de XP e scaling de inimigos
├── data/items.ts        # definições dos itens do hotbar
└── hooks/useInteractionKey.ts
```

## Progressão e stats

`src/data/stats.ts` define o sistema: `stat_final = base(nível 1) × crescimento_por_nível + bônus`.
O save (`localStorage`, chave `portfolio-game-save`) persiste `level`, `xp`,
`statBonuses`, `skills`, `hearts`, `inventory`, `coins`, `slotLimit`, `scene`,
`playerPos` e `consumed` — o resto é derivado via `deriveStats()`.

- **XP**: `xpToNext(level) = ⌊40 × level^1.5⌋` (curva geométrica estilo Diablo II)
- **Nível**: +8% dano, +2% velocidade de ataque, +0.5% move speed, +0.5pp crítico, +1 coração a cada 4 níveis — e cura completa ao upar
- **Inimigos**: `enemyScaling(level)` retorna `hpMult`/`damageMult`/`xpReward` — HP escala mais rápido que o dano do player para a dificuldade acompanhar sem anular a sensação de progresso
- Ganhar XP: `useGameStore.getState().addXp(n)`; bonus de stat: `addStatBonus('damage', 2)`

## Itens (hotbar estilo Minecraft)

`src/data/items.ts` define os 4 itens (um por linguagem), usados pelas teclas `1`–`4`:

| Item | Efeito |
| --- | --- |
| **Java** | Enche a stamina + buff de velocidade/staminaRegen por 6s |
| **C#** | Explosão em área (anel roxo + burst de dígitos; knockback pronto para inimigos) |
| **JavaScript** | Consumido como +1 coração |
| **Python** | Cobra de dígitos que desliza no chão em zigue-zague e persegue o alvo mais próximo |

- Inventário com limite por tipo (`slotLimit`, começa em 3) — pickups respeitam o limite
- `Coin` (5 moedas) é coletável no mundo; o botão `+` na hotbar compra +1 de limite
  (`slotUpgradeCost` cresce 25 por compra)
- Efeitos de mundo são despachados via `pendingEffects` e executados por
  `ItemEffects.tsx`; partículas `0`/`1` são o pool global de `fx/particles.tsx`
  (`emitBinary` / `burstBinary`)
- Save persiste `inventory`, `coins` e `slotLimit`

## Save de mundo e autosave

O estado de mundo por cena fica em `consumedEntities` (ids estáveis por
posição, ex.: `coin:1.2,19`, `crawler:3.2,24`): moedas, pickups, cafés e
inimigos mortos **não voltam** ao trocar de cena nem ao recarregar a página.

Autosave usa o padrão **dirty + debounce + flush** (`useGameStore.ts`):

- Ações frequentes (`queueSave`): coletar, XP, moedas, usar item — agrupadas
  e escritas após 1,2s sem novas mudanças
- Checkpoints (`saveGame` na hora): troca de cena, game over e respawn
- Flush extra em `pagehide` / `beforeunload` / `visibilitychange` (aba oculta)

Enquanto um save é escrito, `saving` acende o `SaveIndicator` no canto
inferior esquerdo (dígito 0/1 piscando). Morrer abre o `GameOver`
(`hearts <= 0` em `takeDamage`); Enter/E ou clique em Continuar chama
`respawn()` — vida cheia no spawn da cena (`SCENE_SPAWNS`).

## Inimigos

`src/components/Crawler.tsx` é o primeiro inimigo: um cubo que rasteja pela
floresta em horda. A IA usa a lib **yuka** — `Vehicle` + `StateMachine` +
steering behaviors (`WanderBehavior`, `SeekBehavior`):

- **wander**: rasteja devagar perto do spawn (leash de 9u)
- **suspect**: `?` — para e "fareja" quando ouve ruído do player
- **chase**: `!` — persegue; ao alertar, chama a horda toda (`alertAllEnemies`)
- **windup**: agacha e carrega (olhos/corpo esquentam em vermelho)
- **lunge**: pulo parabólico na direção do player — dano ao aterrissar (0,5♥)
- **recover** / **stunned**: pausa pós-bote / pulo pra trás ao levar hit

### Suspeita e ruído

O nível de ruído do player (`playerRunning`/`playerMoving` na store, syncado
pelo `Player`) define o raio de escuta: parado 2,2u / andando 5u / correndo 9u.
Dentro do raio, `suspicion` (0→1) cresce mais rápido quanto mais perto e mais
barulho; fora dele, decai. Ao chegar em 1 o inimigo alerta a horda toda —
todos ganham `!` e perseguem juntos. Levar hit também alerta a horda.

### Perder interesse e batalha

Se o player ficar a mais de 13u por 3s, o inimigo desiste (cooldown de
re-aggro de 5s). Enquanto qualquer inimigo estiver engajado, `inBattle` fica
ativo — o autosave é suspenso e o HUD mostra "⚔ EM BATALHA". `endBattle`
(último inimigo morto ou todos desinteressados) é um checkpoint de save.

`src/store/enemyRegistry.ts` registra inimigos vivos para ataques acertarem:
projéteis do orbe (Espaço), explosão do C# (knockback 8) e a cobra do Python
(persegue o inimigo mais próximo) chamam `enemy.hit({ damage, knockback, from })`.
Matar dá XP (`xpReward` do scaling) + moedas. O player tem 0,9s de i-frames
contra hits de inimigo (`damagePlayer`).

## Próximos passos sugeridos

- Colisão/física com `@react-three/rapier` (obstáculos e limites do mapa)
- Click-to-move com raycasting no chão
- Modelos GLB também para os NPCs (usar `SkeletonUtils.clone` para reusar o mesmo arquivo)
- Choices no diálogo (ramificações) e retratos dos personagens
