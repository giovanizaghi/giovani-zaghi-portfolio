import { Canvas } from '@react-three/fiber'
import { KeyboardControls } from '@react-three/drei'
import { Experience } from './components/Experience'
import { DialogueBox } from './ui/DialogueBox'
import { InteractHint } from './ui/InteractHint'
import { useInteractionKey } from './hooks/useInteractionKey'

export type MovementKey = 'forward' | 'back' | 'left' | 'right' | 'run'

const keyMap = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'back', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
]

export default function App() {
  useInteractionKey()

  return (
    <KeyboardControls map={keyMap}>
      <Canvas shadows>
        <Experience />
      </Canvas>
      <InteractHint />
      <DialogueBox />
    </KeyboardControls>
  )
}
