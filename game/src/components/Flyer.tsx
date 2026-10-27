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

// ---- Tunáveis do flyer ----
const BODY_RADIUS = 0.5
const HOVER_HEIGHT = 2.0 // altitude de cruzeiro
const HOVER_BOB = 0.15 // amplitude do balanço vertical
const FLY_SPEED = 1.8 // velocidade vagando (wander)
const CHASE_SPEED = 3.2 // velocidade perseguindo
const LEASH_RANGE = 9 // raio máximo longe do spawn enquanto vaga
const DIVE_RANGE = 3.4 // distância para iniciar o mergulho
const DIVE_LOW = 0.45 // altura no fundo do mergulho
const DIVE_TIME = 0.5 // vai-e-volta completo (ida + volta)
const DIVE_HIT_ALT = 1.1 // abaixo disso o mergulho pode acertar o player
const HIT_RADIUS = 0.95 // raio de dano durante a passada baixa
const WINDUP_TIME = 0.32 // sobe e trava no ar antes de mergulhar
const RECOVER_TIME = 0.55 // pausa pós-mergulho
const STUN_TIME = 0.6 // tempo atordoado após levar hit
const STUN_HOP = 0.5 // solavanco pra cima no stun
const ATTACK_COOLDOWN = 1.2
const BASE_HP = 2
const BASE_DAMAGE = 0.5 // corações por acerto
const COIN_DROP = 5

// ---- Audição/suspeita (mesmos níveis do crawler — a horda escuta igual) ----
const HEAR_IDLE = 2.2
const HEAR_WALK = 5
const HEAR_RUN = 9
const SUSPECT_ENTER = 0.35
const SUSPECT_FILL = 1.1
const SUSPECT_DECAY = 0.5
const LOSE_RANGE = 13
const LOSE_TIME = 3
const REAGGRO_CD = 5

/** Contexto compartilhado entre o frame loop e os estados da FSM */
interface FlyerCtx {
  delta: number
  /** Tempo dentro do estado atual — zerado no enter() de cada estado */
  t: number
  state: string
  hp: number
  damage: number
  xpReward: number
  attackCd: number
  dead: boolean
  /** Altitude atual (eased) — vehicle.position fica sempre em y=0 */
  alt: number
  /** Solavanco do stun — somado por cima de `alt` */
  hopY: number
  /** Velocidade do knockback (XZ) — decai durante o stun */
  knock: Vector3
  diveFrom: Vector3
  diveTo: Vector3
  /** Dano do mergulho já aplicado neste vai-e-volta */
  diveHitDone: boolean
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

interface FlyerProps {
  position: readonly [number, number, number]
}

/**
 * Flyer — cubo alado que sobrevoa o mapa em horda. Mesma IA do Crawler
 * (yuka FSM + steering), trocando o bote terrestre por um mergulho rápido
 * de vai-e-volta: sobe, trava no ar, despenca na direção do player e volta
 * pro ponto de partida (dano durante a passada baixa). Respeita os
 * colisores do cenário e não se sobrepõe aos outros inimigos da horda.
 *
 *   wander  → plana perto do spawn (WanderBehavior + leash)
 *   suspect → "?" — parado no ar farejando; suspeita sobe com o ruído
 *   chase   → "!" — persegue em altitude de cruzeiro (SeekBehavior)
 *   windup  → ganha altura e trava — telegraph do mergulho
 *   dive    → vai-e-volta em V até o player (dano na passada baixa)
 *   recover → pausa pós-mergulho de volta à altitude de cruzeiro
 *   stunned → solavanco pra cima ao levar hit (knockback + stun)
 */
export function Flyer({ position }: FlyerProps) {
  const spawnX = position[0]
  const spawnZ = position[2]
  // Id estável por posição — flyer morto não volta (save de mundo)
  const consumedId = `flyer:${spawnX},${spawnZ}`
  const [dead, setDead] = useState(
    () => useGameStore.getState().consumedEntities[consumedId] === true
  )
  const [marker, setMarker] = useState<Marker>('none')
  const reactId = useId()
  const registryId = `flyer-${reactId}`
  const group = useRef<Group>(null!)
  const body = useRef<Mesh>(null!)
  const wingL = useRef<Group>(null!)
  const wingR = useRef<Group>(null!)
  const flash = useRef(0)
  const facing = useRef(Math.random() * Math.PI * 2)
  const bobPhase = useRef(Math.random() * Math.PI * 2)

  const bodyMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#2e3550',
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
  const wingMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#8fb0d9',
        emissive: '#3d6a9e',
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.85,
        roughness: 0.4,
      }),
    []
  )

  /** Posição compartilhada com o registry — inclui a altitude (mira 3D) */
  const pos3 = useMemo(() => new Vector3(spawnX, HOVER_HEIGHT, spawnZ), [spawnX, spawnZ])

  const { ctx, fsm, vehicle } = useMemo(() => {
    const scaling = enemyScaling(useGameStore.getState().level)
    const store = useGameStore.getState()

    const vehicle = new Vehicle()
    vehicle.position.set(spawnX, 0, spawnZ)
    vehicle.maxSpeed = FLY_SPEED

    const seek = new SeekBehavior()
    const wander = new WanderBehavior(1.6, 2.4, 8)

    const ctx: FlyerCtx = {
      delta: 0,
      t: 0,
      state: 'wander',
      hp: BASE_HP * scaling.hpMult,
      damage: BASE_DAMAGE * scaling.damageMult,
      xpReward: scaling.xpReward,
      attackCd: 0,
      dead: store.consumedEntities[consumedId] === true,
      alt: HOVER_HEIGHT,
      hopY: 0,
      knock: new Vector3(),
      diveFrom: new Vector3(),
      diveTo: new Vector3(),
      diveHitDone: false,
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
        vehicle.maxSpeed = FLY_SPEED
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
        // Parado no ar farejando: suspeita sobe se o player continuar no raio
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
        if (ctx.attackCd <= 0 && ctx.playerDist2 < DIVE_RANGE * DIVE_RANGE)
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
        // Trava no ar um pouco acima — telegraph do mergulho
        ctx.diveFrom.set(pos.x, 0, pos.z)
      }
      execute() {
        if (ctx.t >= WINDUP_TIME) {
          ctx.diveTo.set(ctx.player.x, 0, ctx.player.z)
          ctx.diveHitDone = false
          fsm.changeTo('dive')
        }
      }
    }

    class DiveS extends State<Vehicle> {
      enter() {
        ctx.state = 'dive'
        ctx.t = 0
      }
      execute() {
        const t = Math.min(1, ctx.t / DIVE_TIME)
        // Vai-e-volta: XZ vai até o player na primeira metade e retorna na segunda
        const k = t < 0.5 ? t * 2 : (1 - t) * 2
        pos.x = ctx.diveFrom.x + (ctx.diveTo.x - ctx.diveFrom.x) * k
        pos.z = ctx.diveFrom.z + (ctx.diveTo.z - ctx.diveFrom.z) * k
        // Altitude despenca num seno: cruzeiro → rasante → cruzeiro
        ctx.alt = HOVER_HEIGHT - Math.sin(t * Math.PI) * (HOVER_HEIGHT - DIVE_LOW)
        // Dano uma vez por mergulho, só na passada baixa perto do player
        if (
          !ctx.diveHitDone &&
          ctx.alt < DIVE_HIT_ALT &&
          ctx.playerDist2 < HIT_RADIUS * HIT_RADIUS
        ) {
          ctx.diveHitDone = true
          damagePlayer(ctx.damage)
        }
        if (t >= 1) {
          ctx.alt = HOVER_HEIGHT
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
        ctx.hopY = Math.sin(Math.min(1, ctx.t / STUN_TIME) * Math.PI) * STUN_HOP
        if (ctx.t >= STUN_TIME) {
          ctx.hopY = 0
          fsm.changeTo('chase')
        }
      }
    }

    fsm.add('wander', new WanderS())
    fsm.add('suspect', new SuspectS())
    fsm.add('chase', new ChaseS())
    fsm.add('windup', new WindupS())
    fsm.add('dive', new DiveS())
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
          burstBinary(pos3.x, pos3.y, pos3.z, 26, 3)
          setDead(true)
          unregister()
          return
        }
        // Stun: knockback na direção oposta ao golpe + solavanco pra cima
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

    // ---- Não atravessa obstáculos (push-out circular) nem outros inimigos ----
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
    separateEnemy(registryId, vp, BODY_RADIUS)

    // ---- Altitude (eased nos estados sem controle próprio; o dive anima direto) ----
    if (ctx.state === 'windup') {
      // Sobe acima do cruzeiro carregando o mergulho
      const target = HOVER_HEIGHT + 0.7 * Math.min(1, ctx.t / WINDUP_TIME)
      ctx.alt += (target - ctx.alt) * Math.min(1, delta * 14)
    } else if (ctx.state !== 'dive') {
      ctx.alt += (HOVER_HEIGHT - ctx.alt) * Math.min(1, delta * 6)
    }

    // Balanço de voo + solavanco do stun
    const bob = Math.sin(state.clock.elapsedTime * 3 + bobPhase.current) * HOVER_BOB
    pos3.set(vp.x, ctx.alt + ctx.hopY, vp.z)

    // ---- Visual ----
    const g = group.current
    if (!g) return
    g.position.set(vp.x, ctx.alt + ctx.hopY + bob, vp.z)

    // Rotação: olha pra onde anda; suspeita/preparação/mergulho olha pro player
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

    // Pitch: bica pra baixo no mergulho, empina no windup
    const targetPitch =
      ctx.state === 'dive' ? 0.7 : ctx.state === 'windup' ? -0.35 : 0
    g.rotation.x += (targetPitch - g.rotation.x) * Math.min(1, delta * 10)

    // Corpo: bate asas sempre; mais rápido em perseguição/mergulho
    const flap =
      ctx.state === 'chase' || ctx.state === 'dive' ? 22 : ctx.state === 'windup' ? 4 : 12
    const wingAngle = 0.25 + Math.sin(state.clock.elapsedTime * flap) * 0.55
    wingL.current.rotation.z = wingAngle
    wingR.current.rotation.z = -wingAngle

    const b = body.current
    if (ctx.state === 'dive') {
      // Estica na direção do voo
      b.scale.set(0.85, 0.85, 1.3)
    } else if (ctx.state === 'windup') {
      const s = Math.min(1, ctx.t / WINDUP_TIME)
      b.scale.set(1 + s * 0.15, 1 + s * 0.15, 1 - s * 0.3)
    } else {
      b.scale.set(1, 1, 1)
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
    <group ref={group} position={[position[0], HOVER_HEIGHT, position[2]]}>
      {/* corpo — cubo escuro que voa */}
      <mesh ref={body} castShadow material={bodyMaterial}>
        <boxGeometry args={[0.5, 0.32, 0.6]} />
        {/* olhos filhos do corpo */}
        <mesh position={[0.13, 0.1, 0.31]} material={eyeMaterial}>
          <sphereGeometry args={[0.055, 8, 8]} />
        </mesh>
        <mesh position={[-0.13, 0.1, 0.31]} material={eyeMaterial}>
          <sphereGeometry args={[0.055, 8, 8]} />
        </mesh>
      </mesh>

      {/* asas — abas que batem o tempo todo (pivô na raiz, junto ao corpo) */}
      <group ref={wingL} position={[0.25, 0.14, 0]}>
        <mesh position={[0.21, 0, 0]} material={wingMaterial}>
          <boxGeometry args={[0.42, 0.04, 0.3]} />
        </mesh>
      </group>
      <group ref={wingR} position={[-0.25, 0.14, 0]}>
        <mesh position={[-0.21, 0, 0]} material={wingMaterial}>
          <boxGeometry args={[0.42, 0.04, 0.3]} />
        </mesh>
      </group>

      {/* "?" desconfiou / "!" alertado — flutua acima do corpo */}
      {marker !== 'none' && (
        <Html position={[0, 0.8, 0]} center distanceFactor={12} zIndexRange={[9, 0]}>
          <div className={`enemy-mark ${marker}`}>{marker === 'alert' ? '!' : '?'}</div>
        </Html>
      )}
    </group>
  )
}
