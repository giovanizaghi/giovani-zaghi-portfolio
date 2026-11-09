import { Fragment, Suspense } from 'react'
import { IsoCamera } from './IsoCamera'
import { HomeScenario } from './HomeScenario'
import { HouseExterior } from './HouseExterior'
import { ForestScenario } from './ForestScenario'
import { TransportStation } from './TransportStation'
import { TerminalScenario } from './TerminalScenario'
import { Player } from './Player'
import { Companion } from './Companion'
import { MeleeCombo } from './MeleeCombo'
import { ItemEffects } from './ItemEffects'
import { BinaryParticles } from '../fx/particles'
import { StaminaWheel } from './StaminaWheel'
import { useGameStore } from '../store/useGameStore'

export function Experience() {
  const scene = useGameStore((s) => s.scene)
  // Lua de Sangue: mudar a key remonta o cenário inteiro — entidades
  // consumidas releem a store (já limpa) e voltam a existir
  const worldNonce = useGameStore((s) => s.worldNonce)

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

      {scene === 'outside' ? (
        <Fragment key={`outside-${worldNonce}`}>
          <HouseExterior />
          <ForestScenario />
          <TransportStation />
        </Fragment>
      ) : scene === 'house' ? (
        <Fragment key={`house-${worldNonce}`}>
          <HomeScenario />
        </Fragment>
      ) : (
        <Fragment key={`terminal-${worldNonce}`}>
          <TerminalScenario />
        </Fragment>
      )}

      <Suspense fallback={null}>
        <Player />
        <Companion />
        <MeleeCombo />
      </Suspense>

      <ItemEffects />
      <BinaryParticles />

      <StaminaWheel />
    </>
  )
}
