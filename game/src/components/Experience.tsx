import { Fragment, Suspense } from 'react'
import { IsoCamera } from './IsoCamera'
import { WorldEnvironment } from './WorldEnvironment'
import { SceneRenderer } from './SceneRenderer'
import { Player } from './Player'
import { Companion } from './Companion'
import { MeleeCombo } from './MeleeCombo'
import { ItemEffects } from './ItemEffects'
import { BinaryParticles } from '../fx/particles'
import { StaminaWheel } from './StaminaWheel'
import { useGameStore } from '../store/useGameStore'
import { useWorldStore } from '../store/useWorldStore'

export function Experience() {
  const sceneId = useGameStore((s) => s.scene)
  // Lua de Sangue: mudar a key remonta o cenário inteiro — entidades
  // consumidas releem a store (já limpa) e voltam a existir
  const worldNonce = useGameStore((s) => s.worldNonce)
  const scene = useWorldStore(
    (s) => s.world.scenes[sceneId] ?? s.world.scenes[s.world.startScene]
  )

  return (
    <>
      {scene && <WorldEnvironment env={scene.env} />}

      {scene && (
        <Fragment key={`${sceneId}-${worldNonce}`}>
          <SceneRenderer scene={scene} />
        </Fragment>
      )}

      <IsoCamera zoom={62} />

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
