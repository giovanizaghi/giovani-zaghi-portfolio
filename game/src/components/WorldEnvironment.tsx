import type { SceneEnv } from '../data/world'

/**
 * Ambiente da cena — cor de fundo + luzes a partir de `scene.env`.
 * Os valores da sombra ficam fixos (a câmera ortográfica não muda por cena).
 */
export function WorldEnvironment({ env }: { env: SceneEnv }) {
  return (
    <>
      <color attach="background" args={[env.background]} />

      <hemisphereLight args={[env.hemi.sky, env.hemi.ground, env.hemi.intensity]} />
      <ambientLight intensity={env.ambient} />
      <directionalLight
        position={env.sun.position}
        intensity={env.sun.intensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
    </>
  )
}
