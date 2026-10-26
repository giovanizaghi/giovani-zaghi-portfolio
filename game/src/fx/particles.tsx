import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DynamicDrawUsage,
  ShaderMaterial,
} from 'three'

/**
 * Sistema global de partículas de dígitos binários (0/1 cintilando, brilho azul).
 * Qualquer componente pode soltar partículas chamando `emitBinary()` — o pool é
 * um ring buffer fixo, sem alocação por frame. Renderizar <BinaryParticles />
 * uma única vez na cena.
 */

const MAX_PARTICLES = 600

// Pool flat — módulo-level para que emitBinary funcione fora do React
const pos = new Float32Array(MAX_PARTICLES * 3)
const vel = new Float32Array(MAX_PARTICLES * 3)
const age = new Float32Array(MAX_PARTICLES).fill(1)
const life = new Float32Array(MAX_PARTICLES).fill(1)
const sizeArr = new Float32Array(MAX_PARTICLES)
const seedArr = new Float32Array(MAX_PARTICLES)
const fadeArr = new Float32Array(MAX_PARTICLES)
let cursor = 0

export interface EmitOptions {
  life?: number
  size?: number
}

/** Solta uma partícula de dígito na posição/velocidade dadas */
export function emitBinary(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  { life: l = 0.5, size = 0.22 }: EmitOptions = {}
) {
  const i = cursor
  cursor = (cursor + 1) % MAX_PARTICLES
  pos[i * 3] = x
  pos[i * 3 + 1] = y
  pos[i * 3 + 2] = z
  vel[i * 3] = vx
  vel[i * 3 + 1] = vy
  vel[i * 3 + 2] = vz
  age[i] = 0
  life[i] = l
  sizeArr[i] = size
  seedArr[i] = Math.random()
}

/** Explosão radial de dígitos */
export function burstBinary(
  x: number,
  y: number,
  z: number,
  count: number,
  speed: number,
  opts: EmitOptions = {}
) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * speed
    emitBinary(
      x,
      y,
      z,
      Math.cos(a) * r,
      Math.random() * speed * 0.6,
      Math.sin(a) * r,
      { life: 0.35 + Math.random() * 0.35, ...opts }
    )
  }
}

/** Atlas 128x64 com os glifos "0" e "1" desenhados em canvas */
function createDigitAtlas() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = 'bold 48px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = '#4db8ff'
  ctx.shadowBlur = 10
  ctx.fillStyle = '#eaf7ff'
  for (let i = 0; i < 2; i++) {
    ctx.fillText('0', 32, 36)
    ctx.fillText('1', 96, 36)
  }
  return new CanvasTexture(canvas)
}

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPixelScale;
  attribute float aSize;
  attribute float aSeed;
  attribute float aFade;
  varying float vDigit;
  varying float vFade;
  varying float vSeed;

  void main() {
    vFade = aFade;
    vSeed = aSeed;
    // Cada partícula alterna entre 0 e 1 no próprio ritmo (efeito "dados" cintilando)
    vDigit = mod(floor(aSeed * 11.0 + uTime * 16.0), 2.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelScale * (0.35 + 0.65 * aFade);
    gl_Position = projectionMatrix * mv;
  }
`

const FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  varying float vDigit;
  varying float vFade;
  varying float vSeed;

  void main() {
    vec2 uv = vec2(gl_PointCoord.x * 0.5 + vDigit * 0.5, 1.0 - gl_PointCoord.y);
    vec4 glyph = texture2D(uAtlas, uv);
    float alpha = glyph.a * vFade;
    if (alpha < 0.02) discard;
    vec3 color = mix(vec3(0.30, 0.65, 1.0), vec3(0.75, 0.95, 1.0), fract(vSeed * 5.0));
    gl_FragColor = vec4(color * (0.5 + 0.9 * vFade), alpha);
  }
`

/** Componente que renderiza e atualiza o pool global de dígitos */
export function BinaryParticles() {
  const digitAtlas = useMemo(() => createDigitAtlas(), [])

  const geometry = useMemo(() => {
    const geo = new BufferGeometry()
    geo.setAttribute(
      'position',
      new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage)
    )
    geo.setAttribute('aSize', new BufferAttribute(sizeArr, 1))
    geo.setAttribute('aSeed', new BufferAttribute(seedArr, 1))
    geo.setAttribute('aFade', new BufferAttribute(fadeArr, 1).setUsage(DynamicDrawUsage))
    return geo
  }, [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uPixelScale: { value: 1 },
          uAtlas: { value: digitAtlas },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [digitAtlas]
  )

  useFrame((state, delta) => {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (age[i] >= life[i]) {
        fadeArr[i] = 0
        continue
      }
      age[i] += delta
      const drag = Math.exp(-2.5 * delta)
      vel[i * 3] *= drag
      vel[i * 3 + 1] = vel[i * 3 + 1] * drag + 0.5 * delta
      vel[i * 3 + 2] *= drag
      pos[i * 3] += vel[i * 3] * delta
      pos[i * 3 + 1] += vel[i * 3 + 1] * delta
      pos[i * 3 + 2] += vel[i * 3 + 2] * delta
      fadeArr[i] = Math.max(0, 1 - age[i] / life[i])
    }

    for (const name of ['position', 'aSize', 'aSeed', 'aFade'] as const) {
      geometry.getAttribute(name).needsUpdate = true
    }
    material.uniforms.uTime.value = state.clock.elapsedTime
    // Câmera ortográfica: tamanho em px ≈ tamanho em unidades * zoom * dpr
    material.uniforms.uPixelScale.value = state.camera.zoom * state.viewport.dpr
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}
