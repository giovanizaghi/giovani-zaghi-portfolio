# Models

Personagem Meshy AI (Blond Minima) com animações em arquivos separados:

| Arquivo | Uso |
| --- | --- |
| `..._Character_output.glb` | Modelo base (mesh + rig) |
| `..._Animation_Idle_02_withSkin.glb` | Clip `idle` |
| `..._Animation_Walking_withSkin.glb` | Clip `walk` |
| `..._Animation_Running_withSkin.glb` | Clip `run` |
| `..._Animation_Casual_Walk_withSkin.glb` | Extra (não usado ainda) |
| `..._Animation_Quick_Walk_withSkin.glb` | Extra (não usado ainda) |

Os clips são carregados e renomeados em `src/components/Player.tsx`
(constantes `MODEL_URL` e `ANIMATION_URLS`). Para trocar de personagem,
basta apontar essas constantes para os novos arquivos.
