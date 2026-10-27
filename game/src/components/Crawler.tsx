import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import {
  SeekBehavior,
  State,
  StateMachine,
  Vehicle,
  WanderBehavior,
  Vector3 as YVector3,
} from 'yuka'
import { useGameStore } from '../store/useGameStore'
import {
  alertAllEnemies,
  damagePlayer,
  registerEnemy,
  separateEnemy,
  setInCombat,
} from '../store/enemyRegistry'
import type { EnemyHit } from '../store/enemyRegistry'
import { enemyScaling } from '../data/stats'
import { burstBinary } from '../fx/particles'

// ---- Tunáveis do crawler ----
const BODY_RADIUS = 0.45
const CRAWL_SPEED = 1.4 // velocidade rastejando (wander)
const CHASE_SPEED = 2.6 // velocidade perseguindo
const LEASH_RANGE = 9 // raio máximo longe do spawn enquanto vaga
const LUNGE_RANGE = 2.6 // distância para iniciar o bote
const LUNGE_HEIGHT = 1.4 // altura do pulo de ataque
const LUNGE_TIME = 0.45
const HIT_RADIUS = 0.9 // raio de dano ao aterrissar
const WINDUP_TIME = 0.45 // agacha antes de pular
const RECOVER_TIME = 0.7 // pausa pós-bote
const STUN_TIME = 0.65 // tempo atordoado após levar hit
const STUN_HOP = 0.7 // altura do pulo pra trás
const ATTACK_COOLDOWN = 1.4
const BASE_HP = 3
const BASE_DAMAGE = 0.5 // corações por acerto
const COIN_DROP = 4

// ---- Audição/suspeita (nível de ruído do player) ----
const HEAR_IDLE = 2.2 // player parado: só nota bem de perto ("visão")
const HEAR_WALK = 5 // andando: raio de escuta médio
const HEAR_RUN = 9 // correndo: escuta de longe
const SUSPECT_ENTER = 0.35 // suspeita mínima para entrar no estado "?"
const SUSPECT_FILL = 1.1 // taxa base de crescimento da suspeita (/s)
const SUSPECT_DECAY = 0.5 // decaimento fora do raio de escuta (/s)
const LOSE_RANGE = 13 // distância para começar a perder interesse
const LOSE_TIME = 3 // segundos fora de alcance até desistir da perseguição
const REAGGRO_CD = 5 // tempo "desconfiado de menos" após perder interesse

/** Contexto compartilhado entre o frame loop e os estados da FSM */
interface CrawlerCtx {
  delta: number
  /** Tempo dentro do estado atual — zerado no enter() de cada estado */
  t: number
  state: string
  hp: number
  damage: number
  xpReward: number
  attackCd: number
  dead: boolean
  /** Altura do salto (bote/stun) — só visual, a física segue no chão */
  jumpY: number
  /** Velocidade do knockback (XZ) — decai durante o stun */
  knock: Vector3
  lungeFrom: Vector3
  lungeTo: Vector3
  /** Posição do player, sincronizada a cada frame */
  player: YVector3
  playerDist2: number
  /** Suspeita 0..1 — sobe com ruído do player no raio de escuta */
  suspicion: number
  /** Raio de escuta e taxa de suspeita do frame (nível de ruído) */
  hearRadius: number
  noiseRate: number
  /** Segundos com o player fora de alcance durante a perseguição */
  loseTimer: number
  /** Impede re-aggro instantâneo logo após perder o interesse */
  reaggroCd: number
  /** Engajado em combate — alimenta o inBattle da store */
  inCombat: boolean
}

type Marker = 'none' | 'suspect' | 'alert'

interface CrawlerProps {
  position: readonly [number, number, number]
}

/**
 * Crawler — cubo que rasteja pelo chão em horda. IA feita com a lib `yuka`
 * (FSM + steering behaviors):
 *
 *   wander  → vaga rastejando perto do spawn (WanderBehavior + leash)
 *   suspect → "?" — parou e fareja; suspeita sobe com o ruído do player
 *   chase   → "!" — persegue (SeekBehavior); ao alertar, chama a horda toda
 *   windup  → agacha e carrega o bote
 *   lunge   → pulo parabólico na direção do player (dano ao aterrissar)
 *   recover → pausa pós-bote
 *   stunned → pulo pra trás ao levar hit (knockback + stun)
 *
 * Audição: parado < andando < correndo (HEAR_IDLE/WALK/RUN). Se o player
 * ficar longe por LOSE_TIME segundos, desiste e volta a vagar (a horda
 * desiste junto quando ninguém mais persegue — fim de batalha → autosave).
 */
export function Crawler({ position }: CrawlerProps) {
  const spawnX = position[0]
  const spawnZ = position[2]
  // Id estável por posição — crawler morto não volta (save de mundo)
  const consumedId = `crawler:${spawnX},${spawnZ}`
  const [dead, setDead] = useState(
    () => useGameStore.getState().consumedEntities[consumedId] === true
  )
  const [marker, setMarker] = useState<Marker>('none')
  const reactId = useId()
  const registryId = `crawler-${reactId}`
  const group = useRef<Group>(null!)
  const body = useRef<Mesh>(null!)
  const flash = useRef(0)
  const facing = useRef(Math.random() * Math.PI * 2)

  const bodyMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#4a3555',
        emissive: '#ff3344',
        emissiveIntensity: 0,
        roughness: 0.7,
      }),
    []
  )
  const eyeMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#ffb0a0',
        emissive: '#ff4030',
        emissiveIntensity: 1,
      }),
    []
  )

  /** Posição compartilhada com o registry (three.Vector3) */
  const pos3 = useMemo(() => new Vector3(spawnX, 0, spawnZ), [spawnX, spawnZ])

  const { ctx, fsm, vehicle } = useMemo(() => {
    const scaling = enemyScaling(useGameStore.getState().level)
    const store = useGameStore.getState()

    const vehicle = new Vehicle()
    vehicle.position.set(spawnX, 0, spawnZ)
    vehicle.maxSpeed = CRAWL_SPEED

    const seek = new SeekBehavior()
    const wander = new WanderBehavior(1.4, 2.2, 8)

    const ctx: CrawlerCtx = {
      delta: 0,
      t: 0,
      state: 'wander',
      hp: BASE_HP * scaling.hpMult,
      damage: BASE_DAMAGE * scaling.damageMult,
      xpReward: scaling.xpReward,
      attackCd: 0,
      dead: store.consumedEntities[consumedId] === true,
      jumpY: 0,
      knock: new Vector3(),
      lungeFrom: new Vector3(),
      lungeTo: new Vector3(),
      player: new YVector3(),
      playerDist2: Infinity,
      suspicion: 0,
      hearRadius: HEAR_WALK,
      noiseRate: 0,
      loseTimer: 0,
      reaggroCd: 0,
      inCombat: false,
    }

    const fsm = new StateMachine(vehicle)
    const pos = vehicle.position
    const vel = vehicle.velocity

    class WanderS extends State<Vehicle> {
      // null força a re-seleção do behavior no primeiro execute
      returning: boolean | null = null
      enter() {
        ctx.state = 'wander'
        this.returning = null
        vehicle.steering.clear()
        vehicle.maxSpeed = CRAWL_SPEED
        ctx.suspicion = 0
        setMarker('none')
        if (ctx.inCombat) {
          ctx.inCombat = false
          setInCombat(registryId, false)
        }
      }
      execute() {
        // Leash: longe demais do spawn, volta pra casa em vez de vagar
        const dx = pos.x - spawnX
        const dz = pos.z - spawnZ
        const out = dx * dx + dz * dz > LEASH_RANGE * LEASH_RANGE
        if (out !== this.returning) {
          this.returning = out
          vehicle.steering.clear()
          vehicle.steering.add(out ? seek : wander)
        }
        if (out) seek.target.set(spawnX, 0, spawnZ)
        vehicle.update(ctx.delta)

        // Suspeita cresce se o player fizer ruído dentro do raio de escuta
        if (ctx.reaggroCd <= 0 && ctx.playerDist2 < ctx.hearRadius * ctx.hearRadius) {
          ctx.suspicion += ctx.noiseRate * ctx.delta
          if (ctx.suspicion >= SUSPECT_ENTER) fsm.changeTo('suspect')
        } else {
          ctx.suspicion = Math.max(0, ctx.suspicion - SUSPECT_DECAY * ctx.delta)
        }
      }
    }

    class SuspectS extends State<Vehicle> {
      enter() {
        ctx.state = 'suspect'
        ctx.t = 0
        vehicle.steering.clear()
        vel.set(0, 0, 0)
        setMarker('suspect') // "?" — desconfiou, fareja o player
      }
      execute() {
        // Parado farejando: suspeita sobe se o player continuar no raio, senão desce
        if (ctx.playerDist2 < ctx.hearRadius * ctx.hearRadius) {
          ctx.suspicion += ctx.noiseRate * ctx.delta
        } else {
          ctx.suspicion -= SUSPECT_DECAY * ctx.delta
        }
        if (ctx.suspicion >= 1) {
          alertAllEnemies() // confirmou! alerta a horda toda — cada um chama alert()
        } else if (ctx.suspicion <= 0) {
          fsm.changeTo('wander')
        }
      }
    }

    class ChaseS extends State<Vehicle> {
      enter() {
        ctx.state = 'chase'
        vehicle.steering.clear()
        vehicle.steering.add(seek)
        vehicle.maxSpeed = CHASE_SPEED
        ctx.suspicion = 1
        ctx.loseTimer = 0
        setMarker('alert') // "!"
        if (!ctx.inCombat) {
          ctx.inCombat = true
          setInCombat(registryId, true)
        }
      }
      execute() {
        seek.target.copy(ctx.player)
        vehicle.update(ctx.delta)
        if (ctx.attackCd <= 0 && ctx.playerDist2 < LUNGE_RANGE * LUNGE_RANGE)
          fsm.changeTo('windup')
        // Perde interesse se o player ficar longe por LOSE_TIME segundos
        else if (ctx.playerDist2 > LOSE_RANGE * LOSE_RANGE) {
          ctx.loseTimer += ctx.delta
          if (ctx.loseTimer >= LOSE_TIME) {
            ctx.reaggroCd = REAGGRO_CD
            fsm.changeTo('wander')
          }
        } else {
          ctx.loseTimer = 0
        }
      }
    }

    class WindupS extends State<Vehicle> {
      enter() {
        ctx.state = 'windup'
        ctx.t = 0
        vehicle.steering.clear()
        vel.set(0, 0, 0)
      }
      execute() {
        if (ctx.t >= WINDUP_TIME) {
          ctx.lungeFrom.set(pos.x, 0, pos.z)
          ctx.lungeTo.set(ctx.player.x, 0, ctx.player.z)
          fsm.changeTo('lunge')
        }
      }
    }

    class LungeS extends State<Vehicle> {
      enter() {
        ctx.state = 'lunge'
        ctx.t = 0
      }
      execute() {
        const t = Math.min(1, ctx.t / LUNGE_TIME)
        pos.x = ctx.lungeFrom.x + (ctx.lungeTo.x - ctx.lungeFrom.x) * t
        pos.z = ctx.lungeFrom.z + (ctx.lungeTo.z - ctx.lungeFrom.z) * t
        ctx.jumpY = Math.sin(t * Math.PI) * LUNGE_HEIGHT
        if (t >= 1) {
          ctx.jumpY = 0
          // O bote acerta se aterrissar perto do player
          if (ctx.playerDist2 < HIT_RADIUS * HIT_RADIUS) damagePlayer(ctx.damage)
          fsm.changeTo('recover')
        }
      }
    }

    class RecoverS extends State<Vehicle> {
      enter() {
        ctx.state = 'recover'
        ctx.t = 0
        ctx.attackCd = ATTACK_COOLDOWN
      }
      execute() {
        if (ctx.t >= RECOVER_TIME) fsm.changeTo('chase')
      }
    }

    class StunnedS extends State<Vehicle> {
      enter() {
        ctx.state = 'stunned'
        ctx.t = 0
        vehicle.steering.clear()
        vel.set(0, 0, 0)
      }
      execute() {
        pos.x += ctx.knock.x * ctx.delta
        pos.z += ctx.knock.z * ctx.delta
        ctx.knock.multiplyScalar(Math.exp(-6 * ctx.delta))
        ctx.jumpY = Math.sin(Math.min(1, ctx.t / STUN_TIME) * Math.PI) * STUN_HOP
        if (ctx.t >= STUN_TIME) {
          ctx.jumpY = 0
          fsm.changeTo('chase')
        }
      }
    }

    fsm.add('wander', new WanderS())
    fsm.add('suspect', new SuspectS())
    fsm.add('chase', new ChaseS())
    fsm.add('windup', new WindupS())
    fsm.add('lunge', new LungeS())
    fsm.add('recover', new RecoverS())
    fsm.add('stunned', new StunnedS())
    fsm.changeTo('wander')

    return { ctx, fsm, vehicle }
  }, [spawnX, spawnZ, consumedId, registryId])

  // Registra o inimigo para receber hits de projéteis/efeitos de mundo
  useEffect(() => {
    if (ctx.dead) return // já morto no save — não registra
    const unregister = registerEnemy({
      id: registryId,
      position: pos3,
      radius: BODY_RADIUS,
      isAlive: () => !ctx.dead,
      inCombat: () => ctx.inCombat,
      // Alerta da horda: outro inimigo confirmou o player — ataca junto
      alert: () => {
        if (ctx.dead || ctx.inCombat) return
        ctx.suspicion = 1
        // Durante o stun não interrompe — sai do stun já em perseguição
        if (ctx.state !== 'stunned') fsm.changeTo('chase')
      },
      hit: ({ damage, knockback = 3, from }: EnemyHit) => {
        if (ctx.dead) return
        alertAllEnemies() // levar hit chama a atenção da horda toda
        ctx.hp -= damage
        flash.current = 1
        if (ctx.hp <= 0) {
          ctx.dead = true
          if (ctx.inCombat) {
            ctx.inCombat = false
            setInCombat(registryId, false)
          }
          const store = useGameStore.getState()
          store.addXp(ctx.xpReward)
          store.addCoins(COIN_DROP)
          store.consumeEntity(consumedId)
          burstBinary(pos3.x, 0.5, pos3.z, 26, 3)
          setDead(true)
          unregister()
          return
        }
        // Stun: pulo pra trás na direção oposta ao golpe
        if (knockback > 0 && from) {
          ctx.knock.set(pos3.x - from.x, 0, pos3.z - from.z)
          if (ctx.knock.lengthSq() < 1e-6) ctx.knock.set(0, 0, 1)
          ctx.knock.normalize().multiplyScalar(knockback)
        } else {
          ctx.knock.set(0, 0, 0)
        }
        fsm.changeTo('stunned')
      },
    })
    return unregister
  }, [ctx, fsm, pos3, registryId, consumedId])

  useFrame((state, delta) => {
    if (ctx.dead) return
    const store = useGameStore.getState()
    // IA pausada junto com o player (diálogo/menu/level-up/game over)
    if (
      store.activeNpc !== null ||
      store.menuOpen ||
      store.gameOver ||
      store.pendingLevelUps > 0
    )
      return

    // ---- Percepção: contexto que os estados leem ----
    ctx.delta = delta
    ctx.t += delta
    ctx.attackCd -= delta
    ctx.reaggroCd = Math.max(0, ctx.reaggroCd - delta)
    ctx.player.set(store.playerPosition.x, 0, store.playerPosition.z)
    ctx.playerDist2 = vehicle.position.squaredDistanceTo(ctx.player)
    // Raio de escuta e velocidade da suspeita conforme o ruído do player
    ctx.hearRadius = store.playerRunning
      ? HEAR_RUN
      : store.playerMoving
        ? HEAR_WALK
        : HEAR_IDLE
    const dist = Math.sqrt(ctx.playerDist2)
    const noiseMult = store.playerRunning ? 1.6 : store.playerMoving ? 1 : 0.55
    ctx.noiseRate =
      dist < ctx.hearRadius
        ? (1 - dist / ctx.hearRadius) * noiseMult * SUSPECT_FILL + 0.15
        : 0

    fsm.update()

    // ---- Não atravessa obstáculos (push-out circular) ----
    const vp = vehicle.position
    for (const c of store.colliders) {
      const dx = vp.x - c.position.x
      const dz = vp.z - c.position.z
      const min = BODY_RADIUS + c.radius
      const d2 = dx * dx + dz * dz
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2)
        vp.x = c.position.x + (dx / d) * min
        vp.z = c.position.z + (dz / d) * min
      }
    }

    // ---- Não atravessa outros inimigos (separação de horda) ----
    separateEnemy(registryId, vp, BODY_RADIUS)

    pos3.set(vp.x, ctx.jumpY, vp.z)

    // ---- Visual ----
    const g = group.current
    if (!g) return
    g.position.set(vp.x, ctx.jumpY, vp.z)

    // Rotação: olha pra onde anda; suspeita/preparação/bote/recuo olha pro player
    const vel = vehicle.velocity
    let target = facing.current
    if (ctx.state !== 'wander' && ctx.state !== 'stunned') {
      target = Math.atan2(store.playerPosition.x - vp.x, store.playerPosition.z - vp.z)
    } else if (ctx.state === 'stunned') {
      target = Math.atan2(ctx.knock.x || 0.01, ctx.knock.z || 0.01)
    } else if (vel.x * vel.x + vel.z * vel.z > 0.01) {
      target = Math.atan2(vel.x, vel.z)
    }
    const diff = ((target - facing.current + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    facing.current += diff * Math.min(1, delta * 10)
    g.rotation.y = facing.current

    // Corpo: ondula rastejando; agacha no windup; estica no bote
    const b = body.current
    if (ctx.state === 'windup') {
      const s = Math.min(1, ctx.t / WINDUP_TIME)
      b.scale.set(1 + s * 0.2, 1 - s * 0.45, 1 + s * 0.2)
    } else if (ctx.state === 'lunge') {
      b.scale.set(0.9, 1.25, 0.9)
    } else if (ctx.state === 'suspect') {
      // farejando: estufa um pouco
      const w = Math.sin(state.clock.elapsedTime * 7)
      b.scale.set(1 + w * 0.03, 1 + w * 0.06, 1 + w * 0.03)
    } else {
      const w = Math.sin(state.clock.elapsedTime * (ctx.state === 'chase' ? 16 : 9))
      b.scale.set(1 - w * 0.05, 0.9 + w * 0.1, 1 + w * 0.05)
    }

    // Flash branco ao levar hit; olhos e corpo esquentam no windup
    flash.current *= Math.exp(-7 * delta)
    const windupGlow = ctx.state === 'windup' ? Math.min(1, ctx.t / WINDUP_TIME) * 1.4 : 0
    bodyMaterial.emissiveIntensity = Math.max(flash.current * 2.2, windupGlow)
    eyeMaterial.emissiveIntensity =
      (ctx.inCombat || ctx.state === 'windup' ? 1.6 : 0.8) + flash.current
  })

  if (dead) return null

  return (
    <group ref={group} position={[position[0], 0, position[2]]}>
      {/* corpo achatado — o "cubo" que rasteja */}
      <mesh ref={body} position={[0, 0.18, 0]} castShadow material={bodyMaterial}>
        <boxGeometry args={[0.72, 0.36, 0.85]} />
        {/* olhos filhos do corpo: esmagam junto no windup */}
        <mesh position={[0.17, 0.32, 0.42]} material={eyeMaterial}>
          <sphereGeometry args={[0.06, 8, 8]} />
        </mesh>
        <mesh position={[-0.17, 0.32, 0.42]} material={eyeMaterial}>
          <sphereGeometry args={[0.06, 8, 8]} />
        </mesh>
      </mesh>

      {/* "?" desconfiou / "!" alertado — flutua acima do corpo */}
      {marker !== 'none' && (
        <Html position={[0, 1.15, 0]} center distanceFactor={12} zIndexRange={[9, 0]}>
          <div className={`enemy-mark ${marker}`}>{marker === 'alert' ? '!' : '?'}</div>
        </Html>
      )}
    </group>
  )
}
