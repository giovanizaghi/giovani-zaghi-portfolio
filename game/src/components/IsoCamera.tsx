import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { Vector3 } from 'three'
import type { OrthographicCamera as OrthographicCameraImpl } from 'three'
import { useGameStore } from '../store/useGameStore'

/** Offset clássico isométrico: ângulos iguais nos 3 eixos */
const OFFSET = new Vector3(1, 1, 1).normalize().multiplyScalar(20)

/**
 * Câmera ortográfica isométrica que segue o player suavemente.
 * `zoom` controla o "tamanho" da cena na tela (maior = mais perto).
 */
export function IsoCamera({ zoom = 55 }: { zoom?: number }) {
  const camRef = useRef<OrthographicCameraImpl>(null!)
  const target = useMemo(() => new Vector3(), [])

  useFrame((_, delta) => {
    const playerPos = useGameStore.getState().playerPosition
    target.lerp(playerPos, 1 - Math.exp(-6 * delta))

    const cam = camRef.current
    cam.position.set(target.x + OFFSET.x, target.y + OFFSET.y, target.z + OFFSET.z)
    cam.lookAt(target)
  })

  return (
    <OrthographicCamera
      ref={camRef}
      makeDefault
      zoom={zoom}
      near={-100}
      far={200}
      position={OFFSET.toArray()}
    />
  )
}
