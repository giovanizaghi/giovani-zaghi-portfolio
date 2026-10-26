import { Suspense, useEffect, useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { AnimationMixer, Group } from 'three'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { MODEL_URL, ANIMATION_URLS } from './Player'

const ROTATE_SENSITIVITY = 0.012 // rad por pixel arrastado
const INITIAL_ROTATION = 0.5 // leve ângulo inicial, mais interessante que frente pura

/**
 * Clone do personagem tocando a animação idle — usado no menu de inventário
 * (estilo Breath of the Wild: modelo 3D do personagem ao lado dos itens).
 * O GLB já está em cache do useGLTF, então não recarrega.
 * A rotação Y vem de fora: o player gira o modelo arrastando o mouse.
 */
function IdleCharacter({ rotation }: { rotation: { current: number } }) {
  const group = useRef<Group>(null!)
  const { scene } = useGLTF(MODEL_URL)
  const idle = useGLTF(ANIMATION_URLS.idle)

  // Clona a rig inteira — a scene cacheada não pode ser montada duas vezes
  const cloned = useMemo(() => skeletonClone(scene), [scene])
  const mixer = useMemo(() => new AnimationMixer(cloned), [cloned])

  useEffect(() => {
    const clip = idle.animations[0]
    if (!clip) return
    const action = mixer.clipAction(clip)
    action.play()
    return () => {
      mixer.stopAllAction()
    }
  }, [mixer, idle])

  useEffect(() => {
    cloned.traverse((obj) => {
      obj.castShadow = false
    })
  }, [cloned])

  useFrame((_, delta) => {
    mixer.update(delta)
    // Personagem parado — só gira quando o usuário arrasta o mouse
    group.current.rotation.y = rotation.current
  })

  return (
    <group ref={group} position={[0, -0.8, 0]}>
      <primitive object={cloned} />
    </group>
  )
}

export function CharacterPreview() {
  // Rotação horizontal controlada por arraste (fora do React — atualizada por frame)
  const rotation = useRef(INITIAL_ROTATION)
  const dragging = useRef(false)
  const lastX = useRef(0)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true
    lastX.current = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    // Só eixo horizontal (rotação Y) — estilo vitrine do BOTW
    rotation.current += (e.clientX - lastX.current) * ROTATE_SENSITIVITY
    lastX.current = e.clientX
  }
  const stopDrag = () => {
    dragging.current = false
  }

  return (
    <div
      className="character-preview"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      <Canvas flat camera={{ position: [0, 0.1, 3.4], fov: 32 }}>
        <ambientLight intensity={1.6} />
        <directionalLight position={[3, 5, 4]} intensity={1.8} />
        <Suspense fallback={null}>
          <IdleCharacter rotation={rotation} />
        </Suspense>
      </Canvas>
      <div className="preview-hint">arraste para girar</div>
    </div>
  )
}
