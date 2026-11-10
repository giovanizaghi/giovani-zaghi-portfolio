import type { Entity, SceneData, WorldData } from '../../data/world'
import { ENTITY_DEF_MAP } from '../entityDefs'
import { DIRECTION_VECTORS } from '../../data/transports'
import { ITEMS } from '../../data/items'
import { KEY_COLORS } from '../../data/keys'

/**
 * Desenho do MapCanvas — funções puras (sem DOM além do ctx recebido).
 * Convenção do canvas: x → direita, z → baixo (norte = -Z = cima), igual ao jogo.
 */

export interface DrawInput {
  ctx: CanvasRenderingContext2D
  /** Tamanho do canvas em px CSS */
  w: number
  h: number
  camera: { cx: number; cz: number; scale: number }
  scene: SceneData
  world: WorldData
  selection: string[]
  hoverId: string | null
  /** Ids de entidades com erro de validação — desenhadas em vermelho */
  errorIds: Set<string>
  showGrid: boolean
  /** Box-select em andamento (coordenadas do mundo) */
  marquee: { x0: number; z0: number; x1: number; z1: number } | null
  /** Crosshair do spawn picker (coordenadas do mundo) */
  pickCursor: { x: number; z: number } | null
}

export function worldToScreen(
  cam: { cx: number; cz: number; scale: number },
  w: number,
  h: number,
  x: number,
  z: number
): [number, number] {
  return [(x - cam.cx) * cam.scale + w / 2, (z - cam.cz) * cam.scale + h / 2]
}

export function screenToWorld(
  cam: { cx: number; cz: number; scale: number },
  w: number,
  h: number,
  sx: number,
  sy: number
): [number, number] {
  return [(sx - w / 2) / cam.scale + cam.cx, (sy - h / 2) / cam.scale + cam.cz]
}

const ITEM_COLOR = new Map(ITEMS.map((i) => [i.id, i.color]))

function niceGridStep(scale: number): number {
  // Passo que gera linhas a cada ~28px, em degraus 1-2-5
  const raw = 28 / scale
  for (const s of [0.5, 1, 2, 5, 10, 20, 50]) {
    if (raw <= s) return s
  }
  return 100
}

function snap(v: number, step: number): number {
  return Math.round(v / step) * step
}

/** Desenha tudo — chamado só quando algo mudou (o loop rAF é sob demanda) */
export function drawScene(d: DrawInput): void {
  const { ctx, w, h, camera, scene, world } = d
  const cam = camera

  // ---- Fundo ----
  ctx.fillStyle = '#22303c'
  ctx.fillRect(0, 0, w, h)

  const [vx0, vz0] = screenToWorld(cam, w, h, 0, 0)
  const [vx1, vz1] = screenToWorld(cam, w, h, w, h)
  const minVX = Math.min(vx0, vx1)
  const maxVX = Math.max(vx0, vx1)
  const minVZ = Math.min(vz0, vz1)
  const maxVZ = Math.max(vz0, vz1)

  // ---- Chão da cena (env.ground) ----
  const g = scene.env.ground
  const [gx, gy] = worldToScreen(cam, w, h, g.center[0] - g.size[0] / 2, g.center[1] - g.size[1] / 2)
  const gw = g.size[0] * cam.scale
  const gh = g.size[1] * cam.scale
  ctx.fillStyle = g.color
  ctx.globalAlpha = 0.22
  ctx.fillRect(gx, gy, gw, gh)
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.strokeRect(gx, gy, gw, gh)

  // ---- Grid ----
  if (d.showGrid) {
    const step = niceGridStep(cam.scale)
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = snap(minVX, step); x <= maxVX; x += step) {
      const [sx] = worldToScreen(cam, w, h, x, 0)
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, h)
    }
    for (let z = snap(minVZ, step); z <= maxVZ; z += step) {
      const [, sy] = worldToScreen(cam, w, h, 0, z)
      ctx.moveTo(0, sy)
      ctx.lineTo(w, sy)
    }
    ctx.stroke()
    // Eixos um pouco mais fortes
    const [ox] = worldToScreen(cam, w, h, 0, 0)
    const [, oy] = worldToScreen(cam, w, h, 0, 0)
    const [xAxisSX] = worldToScreen(cam, w, h, minVX, 0)
    const [xAxisEX] = worldToScreen(cam, w, h, maxVX, 0)
    const [, zAxisSY] = worldToScreen(cam, w, h, 0, minVZ)
    const [, zAxisEY] = worldToScreen(cam, w, h, 0, maxVZ)
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.moveTo(xAxisSX, oy)
    ctx.lineTo(xAxisEX, oy)
    ctx.moveTo(ox, zAxisSY)
    ctx.lineTo(ox, zAxisEY)
    ctx.stroke()
  }

  // ---- Bounds (região jogável) ----
  const b = scene.bounds
  const [bx, by] = worldToScreen(cam, w, h, b.minX, b.minZ)
  const bw = (b.maxX - b.minX) * cam.scale
  const bh = (b.maxZ - b.minZ) * cam.scale
  ctx.save()
  ctx.setLineDash([6, 4])
  ctx.strokeStyle = '#e8c170'
  ctx.lineWidth = 1.5
  ctx.strokeRect(bx, by, bw, bh)
  ctx.setLineDash([])
  ctx.fillStyle = 'rgba(232,193,112,0.08)'
  ctx.fillRect(bx, by, bw, bh)
  ctx.restore()

  // ---- Entidades ----
  const sel = new Set(d.selection)
  const margin = 120
  for (const e of scene.entities) {
    const [ex, ey] = worldToScreen(cam, w, h, e.x, e.z)
    if (ex < -margin || ex > w + margin || ey < -margin || ey > h + margin) continue
    drawEntity(ctx, cam.scale, e, ex, ey)
    drawEntityState(ctx, cam.scale, e, ex, ey, {
      selected: sel.has(e.id),
      hovered: d.hoverId === e.id,
      error: d.errorIds.has(e.id),
    })
  }

  // ---- Setas porta/transporte (por cima das entidades) ----
  for (const e of scene.entities) {
    if (e.type !== 'door' && e.type !== 'transport') continue
    const [ex, ey] = worldToScreen(cam, w, h, e.x, e.z)
    if (ex < -margin || ex > w + margin || ey < -margin || ey > h + margin) continue
    drawLinkArrow(ctx, cam, w, h, e, ex, ey, scene, world)
  }

  // ---- Spawn ----
  const [spx, spy] = worldToScreen(cam, w, h, scene.spawn[0], scene.spawn[2])
  drawStar(ctx, spx, spy, Math.max(7, 0.5 * cam.scale), '#ffd75e', '#8a6a1a')
  ctx.fillStyle = '#ffd75e'
  ctx.font = '10px "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.fillText('SPAWN', spx, spy - Math.max(10, 0.6 * cam.scale))

  // ---- Marquee (box-select) ----
  if (d.marquee) {
    const [mx0, mz0] = worldToScreen(cam, w, h, d.marquee.x0, d.marquee.z0)
    const [mx1, mz1] = worldToScreen(cam, w, h, d.marquee.x1, d.marquee.z1)
    ctx.fillStyle = 'rgba(88,166,255,0.12)'
    ctx.fillRect(Math.min(mx0, mx1), Math.min(mz0, mz1), Math.abs(mx1 - mx0), Math.abs(mz1 - mz0))
    ctx.strokeStyle = '#58a6ff'
    ctx.lineWidth = 1
    ctx.strokeRect(Math.min(mx0, mx1), Math.min(mz0, mz1), Math.abs(mx1 - mx0), Math.abs(mz1 - mz0))
  }

  // ---- Crosshair do spawn picker ----
  if (d.pickCursor) {
    const [px, py] = worldToScreen(cam, w, h, d.pickCursor.x, d.pickCursor.z)
    ctx.strokeStyle = '#ff6b6b'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px - 14, py)
    ctx.lineTo(px + 14, py)
    ctx.moveTo(px, py - 14)
    ctx.lineTo(px, py + 14)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(px, py, 8, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// ---- Desenho por entidade ----

function drawEntity(
  ctx: CanvasRenderingContext2D,
  s: number,
  e: Entity,
  ex: number,
  ey: number
) {
  const def = ENTITY_DEF_MAP[e.type]

  switch (e.type) {
    case 'block': {
      ctx.save()
      ctx.translate(ex, ey)
      ctx.rotate(-(e.rotY ?? 0))
      const bw = e.size[0] * s
      const bd = e.size[2] * s
      if (e.visible === false) {
        // Só colisor: contorno tracejado + X
        ctx.strokeStyle = e.color
        ctx.globalAlpha = 0.6
        ctx.setLineDash([4, 3])
        ctx.strokeRect(-bw / 2, -bd / 2, bw, bd)
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(-bw / 2, -bd / 2)
        ctx.lineTo(bw / 2, bd / 2)
        ctx.moveTo(bw / 2, -bd / 2)
        ctx.lineTo(-bw / 2, bd / 2)
        ctx.stroke()
      } else {
        ctx.globalAlpha = 0.4
        ctx.fillStyle = e.color
        ctx.fillRect(-bw / 2, -bd / 2, bw, bd)
        ctx.globalAlpha = 1
        ctx.strokeStyle = e.color
        ctx.lineWidth = 1.5
        ctx.strokeRect(-bw / 2, -bd / 2, bw, bd)
        if (e.collideRadius !== undefined) {
          // Colisor de círculo único — marca o centro
          ctx.fillStyle = e.color
          ctx.beginPath()
          ctx.arc(0, 0, Math.max(2, e.collideRadius * s * 0.4), 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.restore()
      return
    }

    case 'house': {
      ctx.save()
      ctx.translate(ex, ey)
      ctx.rotate(-(e.rotY ?? 0))
      const bw = 16 * s
      const bd = 12 * s
      ctx.globalAlpha = 0.5
      ctx.fillStyle = '#e6d7b8'
      ctx.fillRect(-bw / 2, -bd / 2, bw, bd)
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#b4552e'
      ctx.lineWidth = 2
      ctx.strokeRect(-bw / 2, -bd / 2, bw, bd)
      // Telhado: linha diagonal sugerindo as águas
      ctx.strokeStyle = 'rgba(180,85,46,0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-bw / 2, 0)
      ctx.lineTo(bw / 2, 0)
      ctx.stroke()
      ctx.restore()
      return
    }

    case 'label': {
      ctx.fillStyle =
        e.variant === 'room' ? '#7ea4d8' : e.variant === 'platform' ? '#8fce7a' : '#e8c170'
      ctx.font = `${Math.max(10, Math.min(14, 0.5 * s))}px "Courier New", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(e.text, ex, ey)
      return
    }

    case 'tree': {
      const r = e.height * 0.45 * s
      ctx.fillStyle = 'rgba(62,124,58,0.85)'
      ctx.strokeStyle = '#2d5a2b'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(ex, ey, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#5d4033'
      ctx.beginPath()
      ctx.arc(ex, ey, Math.max(2, r * 0.18), 0, Math.PI * 2)
      ctx.fill()
      return
    }

    case 'door': {
      if (e.panel === true) {
        // Painel físico: retângulo na largura do painel, rotacionado
        ctx.save()
        ctx.translate(ex, ey)
        ctx.rotate(-(e.rotY ?? 0))
        const pw = (e.width ?? 1.6) * s
        const ph = 0.5 * s
        ctx.fillStyle = 'rgba(232,193,112,0.75)'
        ctx.strokeStyle = '#8a6a2a'
        ctx.lineWidth = 1.5
        ctx.fillRect(-pw / 2, -ph / 2, pw, ph)
        ctx.strokeRect(-pw / 2, -ph / 2, pw, ph)
        if (e.lock) {
          ctx.fillStyle = '#6b4d2e'
          ctx.font = `${Math.max(9, ph * 0.9)}px "Courier New", monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('⚿', 0, 0)
        }
        ctx.restore()
      } else {
        // Só anel de trigger: círculo tracejado no raio de interação
        const r = (e.radius ?? 1.4) * s
        ctx.strokeStyle = 'rgba(232,193,112,0.9)'
        ctx.setLineDash([5, 4])
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(ex, ey, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#e8c170'
        ctx.beginPath()
        ctx.arc(ex, ey, Math.max(3, 0.18 * s), 0, Math.PI * 2)
        ctx.fill()
        if (e.lock) {
          ctx.fillStyle = '#6b4d2e'
          ctx.font = '11px "Courier New", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('⚿', ex + r * 0.7, ey - r * 0.7)
        }
      }
      return
    }

    case 'transport':
    case 'parked': {
      // Pegada aproximada por tipo (espelha KIND_DIMS do jogo)
      const dims: Record<string, [number, number]> = {
        elevator: [1.6, 1.6],
        car: [1.4, 2.4],
        van: [1.6, 3.0],
        bus: [1.8, 5.2],
        plane: [1.2, 4.6],
      }
      const [fw, fl] = dims[e.kind] ?? [1.5, 1.5]
      const heading =
        e.type === 'parked' && e.direction
          ? Math.atan2(DIRECTION_VECTORS[e.direction].x, DIRECTION_VECTORS[e.direction].z)
          : e.type === 'transport' && e.ride.kind !== 'elevator'
            ? Math.atan2(DIRECTION_VECTORS[e.ride.direction].x, DIRECTION_VECTORS[e.ride.direction].z)
            : e.rotY ?? 0
      ctx.save()
      ctx.translate(ex, ey)
      ctx.rotate(Math.PI - heading)
      const bw = fw * s
      const bd = fl * s
      ctx.globalAlpha = e.type === 'parked' ? 0.45 : 0.7
      ctx.fillStyle = '#6b8e5a'
      ctx.fillRect(-bw / 2, -bd / 2, bw, bd)
      ctx.globalAlpha = 1
      ctx.strokeStyle = e.type === 'parked' ? '#5a7050' : '#3f5c33'
      ctx.lineWidth = 1.5
      ctx.strokeRect(-bw / 2, -bd / 2, bw, bd)
      // Nariz
      ctx.fillStyle = ctx.strokeStyle
      ctx.beginPath()
      ctx.moveTo(0, -bd / 2 - 3)
      ctx.lineTo(-4, -bd / 2 + 2)
      ctx.lineTo(4, -bd / 2 + 2)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      // Glifo por cima (legível em qualquer direção)
      ctx.fillStyle = '#eef7e8'
      ctx.font = `${Math.max(10, Math.min(14, 0.45 * s))}px "Courier New", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(def.glyph, ex, ey)
      return
    }

    case 'gate': {
      ctx.save()
      ctx.translate(ex, ey)
      ctx.rotate(-(e.rotY ?? 0))
      const gw = (e.size?.[0] ?? 2.4) * s
      const gd = (e.size?.[2] ?? 0.6) * s
      ctx.globalAlpha = 0.55
      ctx.fillStyle = e.color
      ctx.fillRect(-gw / 2, -gd / 2, gw, gd)
      ctx.globalAlpha = 1
      ctx.strokeStyle = e.color
      ctx.lineWidth = 1.5
      ctx.strokeRect(-gw / 2, -gd / 2, gw, gd)
      ctx.restore()
      return
    }

    case 'trigger': {
      const r = e.radius * s
      ctx.strokeStyle = 'rgba(154,138,255,0.75)'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(ex, ey, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#9a8aff'
      ctx.beginPath()
      ctx.arc(ex, ey, Math.max(2.5, 0.15 * s), 0, Math.PI * 2)
      ctx.fill()
      return
    }

    default: {
      // Itens/pickups/inimigos/npc: círculo na cor do def + glifo
      const r = Math.max(6, 0.55 * s)
      ctx.fillStyle = def.color
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(ex, ey, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'
      ctx.lineWidth = 1
      ctx.stroke()
      // Cor específica para item/chave
      if (e.type === 'item') {
        ctx.fillStyle = ITEM_COLOR.get(e.item) ?? '#fff'
        ctx.beginPath()
        ctx.arc(ex, ey, r * 0.55, 0, Math.PI * 2)
        ctx.fill()
      } else if (e.type === 'key') {
        ctx.fillStyle = KEY_COLORS[e.color].color
        ctx.beginPath()
        ctx.arc(ex, ey, r * 0.55, 0, Math.PI * 2)
        ctx.fill()
      } else if (e.type === 'coin') {
        ctx.fillStyle = '#a8842a'
        ctx.beginPath()
        ctx.arc(ex, ey, r * 0.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#10151c'
      ctx.font = `${Math.max(9, r * 0.9)}px "Courier New", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(def.glyph, ex, ey + 0.5)
    }
  }
}

/** Contorno de seleção/hover/erro por cima do glifo */
function drawEntityState(
  ctx: CanvasRenderingContext2D,
  s: number,
  e: Entity,
  ex: number,
  ey: number,
  st: { selected: boolean; hovered: boolean; error: boolean }
) {
  if (!st.selected && !st.hovered && !st.error) return
  ctx.save()
  if (e.type === 'block' || e.type === 'house') {
    const [hw, hd] = e.type === 'block' ? [e.size[0] / 2, e.size[2] / 2] : [8, 6]
    ctx.translate(ex, ey)
    ctx.rotate(-(e.rotY ?? 0))
    ctx.strokeStyle = st.error ? '#ff5555' : st.selected ? '#58a6ff' : 'rgba(158,203,255,0.7)'
    ctx.lineWidth = st.selected ? 2.5 : 1.5
    ctx.strokeRect(-hw * s, -hd * s, hw * 2 * s, hd * 2 * s)
  } else {
    const r = pickOutlineRadius(e) * s
    ctx.strokeStyle = st.error ? '#ff5555' : st.selected ? '#58a6ff' : 'rgba(158,203,255,0.7)'
    ctx.lineWidth = st.selected ? 2.5 : 1.5
    ctx.beginPath()
    ctx.arc(ex, ey, Math.max(r, 8), 0, Math.PI * 2)
    ctx.stroke()
  }
  if (st.error) {
    ctx.fillStyle = '#ff5555'
    ctx.font = 'bold 11px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.fillText('!', ex, ey - Math.max(10, pickOutlineRadius(e) * s + 6))
  }
  ctx.restore()
}

function pickOutlineRadius(e: Entity): number {
  switch (e.type) {
    case 'tree': return e.height * 0.28
    case 'trigger': return e.radius
    case 'door': return e.panel === true ? (e.width ?? 1.6) / 2 + 0.4 : (e.radius ?? 1.4)
    case 'transport': case 'parked':
      return ({ elevator: 1.1, car: 1.5, van: 1.7, bus: 2.3, plane: 2.1 } as Record<string, number>)[e.kind] ?? 1.5
    case 'gate': return e.size ? Math.max(e.size[0], e.size[2]) / 2 : 1.1
    case 'label': return 1.0
    default: return 0.7
  }
}

/** Seta tracejada porta/transporte → destino (ou spawn, se mesma cena) */
function drawLinkArrow(
  ctx: CanvasRenderingContext2D,
  cam: { cx: number; cz: number; scale: number },
  w: number,
  h: number,
  e: Entity & { toScene?: string; toSpawn?: [number, number, number] },
  ex: number,
  ey: number,
  scene: SceneData,
  world: WorldData
) {
  const sameScene = !e.toScene || e.toScene === scene.id
  ctx.save()
  ctx.strokeStyle = '#e8c170'
  ctx.fillStyle = '#e8c170'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 4])

  if (sameScene && e.toSpawn) {
    // Mesma cena: linha até o ponto de spawn
    const [tx, ty] = worldToScreen(cam, w, h, e.toSpawn[0], e.toSpawn[2])
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    ctx.setLineDash([])
    arrowHead(ctx, ex, ey, tx, ty, 7)
    ctx.beginPath()
    ctx.arc(tx, ty, 4, 0, Math.PI * 2)
    ctx.stroke()
  } else if (sameScene && e.type === 'door' && e.panel === true) {
    // Porta de painel sem toScene: LockedDoor teleporta para o lado oposto —
    // seta curta na direção para onde o painel "olha" (rotY)
    const len = 3 * cam.scale
    const tx = ex + Math.sin(e.rotY ?? 0) * len
    const ty = ey + Math.cos(e.rotY ?? 0) * len
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    ctx.setLineDash([])
    arrowHead(ctx, ex, ey, tx, ty, 7)
  } else if (e.toScene) {
    // Outra cena: seta "para a borda" + etiqueta com o nome da cena destino
    const dest = world.scenes[e.toScene]
    // Direção até a borda mais próxima do ponto atual na tela
    const dxs = [ex, w - ex]
    const dzs = [ey, h - ey]
    const edge =
      Math.min(...dxs) < Math.min(...dzs)
        ? ex < w / 2
          ? { x: -1, z: 0 }
          : { x: 1, z: 0 }
        : ey < h / 2
          ? { x: 0, z: -1 }
          : { x: 0, z: 1 }
    const labelX = ex + edge.x * 44
    const labelY = ey + edge.z * 44
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(labelX, labelY)
    ctx.stroke()
    ctx.setLineDash([])
    arrowHead(ctx, ex, ey, labelX, labelY, 7)
    // Etiqueta
    const name = dest ? `${dest.name} (${e.toScene})` : e.toScene
    ctx.font = '11px "Courier New", monospace'
    const tw = ctx.measureText(name).width + 10
    ctx.fillStyle = 'rgba(34,48,60,0.9)'
    ctx.strokeStyle = '#e8c170'
    ctx.lineWidth = 1
    const lx = labelX - tw / 2
    const ly = labelY - 9
    ctx.fillRect(lx, ly, tw, 18)
    ctx.strokeRect(lx, ly, tw, 18)
    ctx.fillStyle = '#e8c170'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, labelX, ly + 9)
  }
  ctx.restore()
}

function arrowHead(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number
) {
  const ang = Math.atan2(y1 - y0, x1 - x0)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - size * Math.cos(ang - 0.45), y1 - size * Math.sin(ang - 0.45))
  ctx.lineTo(x1 - size * Math.cos(ang + 0.45), y1 - size * Math.sin(ang + 0.45))
  ctx.closePath()
  ctx.fill()
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  stroke: string
) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45
    const a = (i * Math.PI) / 5 - Math.PI / 2
    const x = Math.cos(a) * rad
    const y = Math.sin(a) * rad
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}
