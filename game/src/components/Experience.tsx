import { Suspense } from 'react'
import { IsoCamera } from './IsoCamera'
import { Ground } from './Ground'
import { Player } from './Player'
import { Npc } from './Npc'

export function Experience() {
  return (
    <>
      <color attach="background" args={['#0f1117']} />
      <fog attach="fog" args={['#0f1117', 25, 45]} />

      <ambientLight intensity={0.6} />
      <directionalLight
        position={[8, 12, 4]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />

      <IsoCamera />
      <Ground />

      <Suspense fallback={null}>
        <Player />
      </Suspense>

      <Npc position={[3, 0, 2]} dialogueId="elder" color="#b5651d" />
      <Npc position={[-4, 0, -2]} dialogueId="merchant" color="#4a7a9e" />
    </>
  )
}
