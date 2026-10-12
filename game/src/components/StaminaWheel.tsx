import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, Sprite, SpriteMaterial } from 'three'
import { useGameStore } from '../store/useGameStore'

const CANVAS_SIZE = 64
const HALO_RADIUS = CANVAS_SIZE / 2 - 4

function createStaminaTexture(stamina: number) {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE
  const ctx = canvas.getContext('2d')!
  const cx = CANVAS_SIZE / 2
  const cy = CANVAS_SIZE / 2

  // Anel escuro de fundo
  ctx.beginPath()
  ctx.arc(cx, cy, HALO_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(20, 40, 18, 0.75)'
  ctx.fill()

  // Setor verde de stamina (começa no topo)
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.arc(cx, cy, HALO_RADIUS, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * stamina)
  ctx.fillStyle = '#4ade80'
  ctx.fill()

  // Furo central para virar um anel
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.arc(cx, cy, HALO_RADIUS * 0.55, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'

  const texture = new CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

export function StaminaWheel() {
  const sprite = useRef<Sprite>(null)
  const stamina = useGameStore((s) => s.stamina)
  const texture = useMemo(() => createStaminaTexture(stamina), [stamina])
  const material = useMemo(() => new SpriteMaterial({ map: texture, transparent: true }), [texture])

  useFrame(() => {
    const playerPos = useGameStore.getState().playerPosition
    sprite.current?.position.set(playerPos.x + 0.45, playerPos.y + 1.75, playerPos.z)
  })

  return <sprite ref={sprite} material={material} scale={[0.55, 0.55, 1]} visible={stamina < 1} />
}
