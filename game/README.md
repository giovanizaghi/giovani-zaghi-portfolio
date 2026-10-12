# Isometric RPG — Three.js + React Three Fiber

Jogo 3D isométrico estilo RPG: personagem GLB animado andando pelo mapa, câmera
ortográfica que o segue, e interação com NPCs via diálogos com efeito typewriter.

## Stack

- **Vite** + React 19 + TypeScript
- **three** + **@react-three/fiber** (render / game loop)
- **@react-three/drei** (câmera, `useGLTF`, `useAnimations`, `KeyboardControls`)
- **zustand** (estado do jogo: diálogo, interação, posição do player)

## Como rodar

```bash
npm install
npm run dev
```

Abra http://localhost:5173

## Deploy (Railway)

O projeto está pronto para deploy como site estático na Railway (Railpack detecta o Vite e serve `dist/` com Caddy).

1. Crie um novo projeto na Railway a partir deste repositório GitHub.
2. Em **Settings → Source**, defina **Root Directory** como `game`.
3. (Opcional) Em **Variables**, adicione `RAILPACK_SPA_OUTPUT_DIR=dist` caso a detecção automática falhe.
4. Gere um domínio em **Settings → Networking → Generate Domain**.

A configuração de build/deploy está em `railway.json`. O healthcheck responde em `/health`.

## Controles

| Tecla | Ação |
| --- | --- |
| `WASD` / setas | Mover o personagem (relativo à câmera) |
| `Shift` (segurar) | Correr |
| `E` | Falar com NPC / avançar fala |
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
│   ├── Npc.tsx          # NPC com detecção de proximidade
│   └── Ground.tsx       # chão e decoração do mapa
├── ui/
│   ├── DialogueBox.tsx  # caixa de diálogo com typewriter
│   └── InteractHint.tsx # "E — Falar com ..."
├── store/useGameStore.ts# zustand
├── data/dialogues.ts    # falas por NPC
└── hooks/useInteractionKey.ts
```

## Próximos passos sugeridos

- Colisão/física com `@react-three/rapier` (obstáculos e limites do mapa)
- Click-to-move com raycasting no chão
- Modelos GLB também para os NPCs (usar `SkeletonUtils.clone` para reusar o mesmo arquivo)
- Choices no diálogo (ramificações) e retratos dos personagens
