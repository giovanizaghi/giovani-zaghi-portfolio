import { Suspense } from 'react'
import { IsoCamera } from './IsoCamera'
import { HomeScenario } from './HomeScenario'
import { ForestScenario } from './ForestScenario'
import { Player } from './Player'
import { StaminaWheel } from './StaminaWheel'

export function Experience() {
  return (
    <>
      <color attach="background" args={['#9fc8d6']} />

      <hemisphereLight args={['#dff4ff', '#7f9a68', 1.5]} />
      <ambientLight intensity={1.2} />
      <directionalLight
        position={[8, 12, 4]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />

      <IsoCamera zoom={62} />
      <HomeScenario />
      <ForestScenario />

      <Suspense fallback={null}>
        <Player />
      </Suspense>

      <StaminaWheel />
    </>
  )
}
