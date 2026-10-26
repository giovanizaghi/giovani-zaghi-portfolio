import { Canvas } from '@react-three/fiber'
import { KeyboardControls } from '@react-three/drei'
import { Experience } from './components/Experience'
import { DialogueBox } from './ui/DialogueBox'
import { Hud } from './ui/Hud'
import { Hotbar } from './ui/Hotbar'
import { InventoryMenu } from './ui/InventoryMenu'
import { InteractHint } from './ui/InteractHint'
import { GameOver } from './ui/GameOver'
import { SaveIndicator } from './ui/SaveIndicator'
import { useInteractionKey } from './hooks/useInteractionKey'
import { useMenuKey } from './hooks/useMenuKey'

export type MovementKey = 'forward' | 'back' | 'left' | 'right' | 'run' | 'attack'

const keyMap = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'back', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
  { name: 'attack', keys: ['Space'] },
]

export default function App() {
  useInteractionKey()
  useMenuKey()

  return (
    <KeyboardControls map={keyMap}>
      <Canvas flat>
        <Experience />
      </Canvas>
      <Hud />
      <Hotbar />
      <InteractHint />
      <DialogueBox />
      <SaveIndicator />
      <GameOver />
      <InventoryMenu />
    </KeyboardControls>
  )
}
