import { create } from 'zustand'
import { Vector3 } from 'three'
import { useWorldStore } from './useWorldStore'
import { isEditMode } from './editMode'
import {
  deriveStats,
  xpToNext,
  EMPTY_BONUSES,
  applyBuffs,
  MAX_LEVEL,
  MAX_PROJECTILES,
  LEVEL_UP_OPTIONS,
} from '../data/stats'
import type { StatBlock, Buff, LevelUpOption } from '../data/stats'
import { ITEMS, ITEM_IDS, INITIAL_ITEM_COUNT, INITIAL_SLOT_LIMIT, slotUpgradeCost } from '../data/items'
import type { ItemId } from '../data/items'
import { KEY_COLOR_IDS } from '../data/keys'
import type { KeyColor } from '../data/keys'
import type { TransportLink, TransportRide } from '../data/transports'
import { burstBinary } from '../fx/particles'

export interface Collider {
  id: string
  position: Vector3
  radius: number
}

/** Id de cena — string livre definida pelas chaves de `world.scenes`
 *  (src/data/default-world.json). Spawn/bounds vêm do useWorldStore. */
export type SceneId = string

/** Alvo de interação que troca de cena (porta da casa / saída / transporte) */
export interface DoorTarget {
  label: string
  scene: SceneId
  spawn: [number, number, number]
  /** Trava por chave — o primeiro E consome a chave e abre; depois vira porta normal */
  lock?: { id: string; color: KeyColor; position: [number, number, number] }
  /** Transporte que faz a viagem animada até `scene`/`spawn` — sem isso, teleporte direto */
  transport?: TransportLink
}

/** Viagem de transporte em andamento — a cena destino só carrega quando a
 *  animação do `<Transport>` termina e chama `finishTransport` */
export interface ActiveTransition {
  /** Id do `<Transport>` na cena de origem que está animando */
  id: string
  ride: TransportRide
  scene: SceneId
  spawn: [number, number, number]
  /** performance.now() do embarque — a animação é medida pelo relógio */
  startedAt: number
}

/** Efeito de mundo disparado por item — consumido pelo ItemEffects no próximo frame */
export type WorldEffect =
  | { type: 'explosion' } // C# — knockback em área
  | { type: 'snake' } // Python — projétil rastejante teleguiado
  | { type: 'use' } // Java / JavaScript — burst de dígitos no player

interface GameStore {
  /** Cena ativa */
  scene: SceneId
  /** Posição atual do player (Vector3 mutado por frame — leia via getState, sem re-render) */
  playerPosition: Vector3
  /** Direção que o player está olhando (Vector3 mutado por frame — leia via getState) */
  playerDirection: Vector3
  /** Teleporte pendente — o Player aplica no próximo frame e limpa */
  pendingSpawn: Vector3 | null
  /** Porta em alcance de interação (null = nenhuma) */
  interactDoor: DoorTarget | null
  /** Viagem de transporte em andamento (null = nenhuma) — bloqueia input,
   *  dano e IA; NÃO é persistida no save */
  transition: ActiveTransition | null
  /** Id do NPC em alcance de interação (null = nenhum) */
  interactTarget: string | null
  /** Id do NPC com diálogo aberto (null = diálogo fechado) */
  activeNpc: string | null
  /** Menu de inventário aberto (Tab) — pausa movimento e ataques */
  menuOpen: boolean
  /** Índice da fala atual dentro do diálogo ativo */
  lineIndex: number
  /** Obstáculos que o player não pode atravessar */
  colliders: Collider[]
  /** Entidades de mundo já consumidas (moedas, pickups, inimigos mortos) — persiste por cena */
  consumedEntities: Record<string, true>
  /** Nonce que força o remount do cenário — a Lua de Sangue incrementa para resetar o mundo */
  worldNonce: number
  /** Tela de game over aberta — pausa movimento, ataques e IA */
  gameOver: boolean
  /** Em combate com a horda — o autosave fica suspenso até o fim da batalha */
  inBattle: boolean
  /** O player está correndo (Shift) — inimigos escutam de mais longe */
  playerRunning: boolean
  /** O player está andando — ruído médio entre parado e correndo */
  playerMoving: boolean
  /** Um save está sendo escrito agora — acende o indicador no canto da tela */
  saving: boolean
  /** Vida atual (estilo Zelda) — o máximo vem de `deriveStats(level, statBonuses)` */
  hearts: number
  maxHearts: number
  /** Stamina para correr, de 0 a 1 */
  stamina: number
  /** Nível do personagem (persistido) */
  level: number
  /** XP acumulado no nível atual (persistido) */
  xp: number
  /** Escolhas de upgrade pendentes — >0 abre a tela de level-up e pausa o jogo (persistido) */
  pendingLevelUps: number
  /** Bônus flat adquiridos via pickups/upgrades (persistido) */
  statBonuses: StatBlock
  /** Skills coletadas (C#, Python, Design, etc.) */
  skills: string[]
  /** Inventário do hotbar: quantidade por item (persistido) */
  inventory: Record<ItemId, number>
  /** Limite de itens carregados por tipo — aumenta comprando slots (persistido) */
  slotLimit: number
  /** Moedas coletadas (persistido) */
  coins: number
  /** Chaves na mochila por cor — sempre coletáveis, não usam slotLimit (persistido) */
  keys: Record<KeyColor, number>
  /** Portas destrancadas por id de trava — a chave é consumida e não volta (persistido) */
  unlockedDoors: Record<string, true>
  /** Slot selecionado no hotbar (0–3) */
  selectedSlot: number
  /** Buffs temporários ativos (item Java etc.) — expiram por timestamp */
  buffs: Buff[]
  /** Fila de efeitos de mundo — ItemEffects consome no próximo frame */
  pendingEffects: WorldEffect[]
  setInteractTarget: (id: string | null) => void
  setInteractDoor: (door: DoorTarget | null) => void
  /** Troca de cena e posiciona o player no spawn */
  enterScene: (scene: SceneId, spawn: [number, number, number]) => void
  /** Interage com uma porta: destranca com a chave certa (consumindo) ou teleporta.
   *  Portas da mesma cena usam enterScene com a cena atual — vira só um teleporte.
   *  Alvos com `transport` embarcam no veículo (animação antes de carregar) */
  interactWithDoor: (door: DoorTarget) => void
  /** Embarca num transporte: trava input/dano/IA até `finishTransport`.
   *  No-op se já houver viagem em andamento */
  startTransport: (transport: TransportLink, scene: SceneId, spawn: [number, number, number]) => void
  /** Fim da animação do transporte: carrega a cena destino e encerra a viagem */
  finishTransport: () => void
  clearPendingSpawn: () => void
  openDialogue: (npcId: string) => void
  /** Abre/fecha o menu de inventário (Tab) */
  setMenuOpen: (open: boolean) => void
  /** Avança para a próxima fala; fecha o diálogo ao chegar no fim */
  advanceDialogue: () => void
  closeDialogue: () => void
  registerCollider: (collider: Collider) => void
  unregisterCollider: (id: string) => void
  addHeart: (amount?: number) => void
  addStamina: (amount: number) => void
  consumeStamina: (amount: number) => void
  addSkill: (skill: string) => void
  /** Adiciona XP (já multiplicado por xpGain) e sobe de nível, curando ao upar.
   *  Cada nível ganho empilha uma escolha em pendingLevelUps (cap MAX_LEVEL) */
  addXp: (amount: number) => void
  /** Gasta uma escolha de level-up aplicando o bônus do upgrade escolhido */
  chooseUpgrade: (id: LevelUpOption['id']) => void
  /** Incrementa um bônus flat de stat (pickups, upgrades futuros) */
  addStatBonus: (stat: keyof StatBlock, amount: number) => void
  /** Marca uma entidade de mundo como consumida (não respawna) */
  consumeEntity: (id: string) => void
  /** Lua de Sangue: limpa as entidades consumidas e remonta o cenário — inimigos, moedas e pickups voltam */
  resetWorld: () => void
  /** Aplica dano ao player já descontando a defesa — hearts 0 abre o game over */
  takeDamage: (amount: number) => void
  /** Sai do game over: vida cheia + respawn no ponto da cena atual */
  respawn: () => void
  /** Atualiza o ruído do player: correndo (alto) / andando (médio) / parado (baixo) */
  setPlayerNoise: (running: boolean, moving: boolean) => void
  /** A horda alertou o player — começa a batalha e suspende o autosave */
  startBattle: () => void
  /** Batalha encerrada (horda derrotada ou despistada) — checkpoint de save */
  endBattle: () => void
  /** Agenda um save (debounce) — usar para mudanças frequentes */
  queueSave: () => void
  /** Persiste progressão em localStorage agora + acende o indicador */
  saveGame: () => void
  /** Carrega progressão salva (chamado uma vez na inicialização) */
  loadGame: () => void
  /** Seleciona o slot do hotbar (0–3) */
  selectSlot: (slot: number) => void
  /** Usa o item do slot: decrementa, aplica o efeito e enfileira o FX. Retorna se usou. */
  useItem: (slot: number) => boolean
  /** Coleta itens do mundo, respeitando o slotLimit. Retorna quantos couberam. */
  collectItem: (id: ItemId, amount?: number) => number
  /** Coleta uma chave — incremento simples, sem limite de inventário */
  collectKey: (color: KeyColor) => void
  addCoins: (amount: number) => void
  /** Compra +1 de limite de slots com moedas. Retorna se comprou. */
  buySlotUpgrade: () => boolean
  /** ItemEffects consome a fila de efeitos pendentes */
  consumeEffects: () => WorldEffect[]
}

const SAVE_KEY = 'portfolio-game-save'

// Cena/spawn iniciais vêm do mundo já carregado por loadWorld() (bundled ou
// draft). `?world=draft&scene=<id>` força a cena do teste do editor.
const initialWorld = useWorldStore.getState()
const initialScene = initialWorld.testScene ?? initialWorld.world.startScene
const initialSpawn =
  initialWorld.getSpawn(initialScene) ?? ([0, 0, 0] as [number, number, number])

// Persistência desligada: modo teste do editor (`?world=draft`) e preview 3D
// do /editor (isEditMode) — em ambos o jogo nunca lê nem escreve o save real.
const PERSISTENCE_OFF = initialWorld.source === 'draft' || isEditMode()

// ---- Autosave ----
// Padrão "dirty + debounce + flush": ações frequentes marcam o save como
// pendente (queueSave) e escrevem em lote após AUTOSAVE_DELAY ms sem novas
// mudanças; checkpoints importantes chamam saveGame() direto. O flush também
// acontece quando a aba fecha/perde foco para não perder o save pendente.
const AUTOSAVE_DELAY = 1200
const SAVING_FLASH_MS = 900
let saveTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false

export const useGameStore = create<GameStore>((set, get) => ({
  scene: initialScene,
  playerPosition: new Vector3(...initialSpawn),
  playerDirection: new Vector3(0, 0, 1),
  // O Player aplica no primeiro frame — sem save (novo jogo ou modo teste do
  // editor) ele nasce no spawn da cena inicial; loadGame sobrescreve se houver save
  pendingSpawn: new Vector3(...initialSpawn),
  interactDoor: null,
  transition: null,
  interactTarget: null,
  activeNpc: null,
  menuOpen: false,
  lineIndex: 0,
  colliders: [],
  consumedEntities: {},
  worldNonce: 0,
  gameOver: false,
  inBattle: false,
  playerRunning: false,
  playerMoving: false,
  saving: false,
  hearts: 3,
  maxHearts: 3,
  stamina: 1,
  level: 1,
  xp: 0,
  pendingLevelUps: 0,
  statBonuses: { ...EMPTY_BONUSES },
  skills: [],
  inventory: Object.fromEntries(ITEM_IDS.map((id) => [id, INITIAL_ITEM_COUNT])) as Record<
    ItemId,
    number
  >,
  slotLimit: INITIAL_SLOT_LIMIT,
  coins: 0,
  keys: { silver: 0, gold: 0 },
  unlockedDoors: {},
  selectedSlot: 0,
  buffs: [],
  pendingEffects: [],
  setInteractTarget: (id) => {
    if (get().interactTarget !== id) set({ interactTarget: id })
  },
  setInteractDoor: (door) => {
    if (get().interactDoor !== door) set({ interactDoor: door })
  },
  enterScene: (scene, spawn) => {
    set({
      scene,
      pendingSpawn: new Vector3(...spawn),
      interactDoor: null,
      interactTarget: null,
      // Se enterScene for chamado direto no meio de uma viagem (aborta o ride)
      transition: null,
    })
    // playerPosition ainda tem as coords da cena anterior — sincroniza antes do save
    get().playerPosition.set(...spawn)
    get().saveGame() // troca de cena é um checkpoint — salva na hora
  },
  interactWithDoor: (door) => {
    // Viagem em andamento — nenhuma interação de porta vale até ela terminar
    if (get().transition) return
    const lock = door.lock
    if (lock && !get().unlockedDoors[lock.id]) {
      const { keys } = get()
      if (keys[lock.color] <= 0) return // trancada e sem a chave — nada acontece
      set((state) => ({
        keys: { ...state.keys, [lock.color]: state.keys[lock.color] - 1 },
        unlockedDoors: { ...state.unlockedDoors, [lock.id]: true },
      }))
      burstBinary(lock.position[0], lock.position[1], lock.position[2], 14, 2, {
        size: 0.3,
      })
      get().saveGame() // destrancar é checkpoint — a chave consumida persiste
      return
    }
    if (door.transport) {
      get().startTransport(door.transport, door.scene, door.spawn)
    } else {
      get().enterScene(door.scene, door.spawn)
    }
  },
  startTransport: (transport, scene, spawn) => {
    if (get().transition) return // já embarcado — ignora
    set({
      transition: {
        id: transport.id,
        ride: transport.ride,
        scene,
        spawn,
        startedAt: performance.now(),
      },
      interactDoor: null,
      interactTarget: null,
    })
  },
  finishTransport: () => {
    const t = get().transition
    if (!t) return
    get().enterScene(t.scene, t.spawn) // enterScene já limpa transition
    set({ transition: null })
  },
  clearPendingSpawn: () => set({ pendingSpawn: null }),
  openDialogue: (npcId) => set({ activeNpc: npcId, lineIndex: 0 }),
  setMenuOpen: (open) => set({ menuOpen: open }),
  advanceDialogue: () => {
    const { activeNpc, lineIndex } = get()
    if (!activeNpc) return
    const total =
      useWorldStore.getState().world.dialogues[activeNpc]?.lines.length ?? 0
    if (lineIndex + 1 >= total) {
      set({ activeNpc: null, lineIndex: 0 })
    } else {
      set({ lineIndex: lineIndex + 1 })
    }
  },
  closeDialogue: () => set({ activeNpc: null, lineIndex: 0 }),
  registerCollider: (collider) => {
    set((state) => ({
      colliders: state.colliders.some((c) => c.id === collider.id)
        ? state.colliders
        : [...state.colliders, collider],
    }))
  },
  unregisterCollider: (id) => {
    set((state) => ({
      colliders: state.colliders.filter((c) => c.id !== id),
    }))
  },
  addHeart: (amount = 1) => {
    set((state) => ({ hearts: Math.min(state.maxHearts, state.hearts + amount) }))
  },
  addStamina: (amount) => {
    set((state) => ({ stamina: Math.min(1, Math.max(0, state.stamina + amount)) }))
  },
  consumeStamina: (amount) => {
    set((state) => ({ stamina: Math.max(0, state.stamina - amount) }))
  },
  addSkill: (skill) => {
    set((state) => ({
      skills: state.skills.includes(skill) ? state.skills : [...state.skills, skill],
    }))
    get().queueSave()
  },
  addXp: (amount) => {
    set((state) => {
      if (state.level >= MAX_LEVEL) return state
      const gain = deriveStats(state.level, state.statBonuses).xpGain
      let xp = state.xp + amount * gain
      let level = state.level
      while (xp >= xpToNext(level) && level < MAX_LEVEL) {
        xp -= xpToNext(level)
        level += 1
      }
      // No nível máximo a barra fica cheia e o XP extra é descartado
      if (level >= MAX_LEVEL) xp = xpToNext(MAX_LEVEL)
      const gained = level - state.level
      const maxHearts = deriveStats(level, state.statBonuses).maxHearts
      return {
        xp,
        level,
        maxHearts,
        pendingLevelUps: state.pendingLevelUps + gained,
        // Subiu de nível: cura completa
        hearts: gained > 0 ? maxHearts : Math.min(state.hearts, maxHearts),
      }
    })
    get().queueSave()
  },
  chooseUpgrade: (id) => {
    const state = get()
    if (state.pendingLevelUps <= 0) return
    const option = LEVEL_UP_OPTIONS.find((o) => o.id === id)
    if (!option) return
    // Tiro adicional esgotado — não deixa gastar a escolha num upgrade no máximo
    if (
      option.stat === 'projectiles' &&
      deriveStats(state.level, state.statBonuses).projectiles >= MAX_PROJECTILES
    )
      return
    get().addStatBonus(option.stat, option.amount)
    set({ pendingLevelUps: state.pendingLevelUps - 1 })
  },
  addStatBonus: (stat, amount) => {
    set((state) => {
      const statBonuses = { ...state.statBonuses, [stat]: state.statBonuses[stat] + amount }
      const derived = deriveStats(state.level, statBonuses)
      return {
        statBonuses,
        maxHearts: derived.maxHearts,
        hearts: Math.min(state.hearts, derived.maxHearts),
      }
    })
    get().queueSave()
  },
  consumeEntity: (id) => {
    set((state) => ({
      consumedEntities: { ...state.consumedEntities, [id]: true },
    }))
    get().queueSave()
  },
  resetWorld: () => {
    set((state) => {
      // Chaves coletadas sobrevivem à Lua de Sangue — senão cada reset geraria chave infinita
      const consumedEntities: Record<string, true> = {}
      for (const id of Object.keys(state.consumedEntities)) {
        if (id.startsWith('key:')) consumedEntities[id] = true
      }
      return { consumedEntities, worldNonce: state.worldNonce + 1 }
    })
    get().saveGame() // mundo resetado é checkpoint — a lua de sangue persiste
  },
  takeDamage: (amount) => {
    set((state) => {
      // Em viagem de transporte o player "embarou" — não recebe dano
      if (state.gameOver || state.transition) return state
      const defense = deriveStats(state.level, state.statBonuses).defense
      const hearts = Math.max(0, state.hearts - amount * (1 - defense))
      return { hearts, gameOver: hearts <= 0 }
    })
    if (get().gameOver) get().saveGame()
  },
  respawn: () => {
    const { scene, maxHearts } = get()
    const world = useWorldStore.getState()
    const spawn =
      world.getSpawn(scene) ??
      world.getSpawn(world.world.startScene) ??
      ([0, 0, 0] as [number, number, number])
    set({
      gameOver: false,
      hearts: maxHearts,
      activeNpc: null,
      menuOpen: false,
      pendingSpawn: new Vector3(...spawn),
    })
    get().playerPosition.set(...spawn)
    get().saveGame()
  },
  setPlayerNoise: (running, moving) => {
    const s = get()
    if (s.playerRunning !== running || s.playerMoving !== moving)
      set({ playerRunning: running, playerMoving: moving })
  },
  startBattle: () => {
    if (!get().inBattle) set({ inBattle: true })
  },
  endBattle: () => {
    if (!get().inBattle) return
    set({ inBattle: false })
    get().saveGame() // fim da batalha (horda derrotada ou despistada) = checkpoint
  },
  queueSave: () => {
    // Modo teste do editor: nunca agenda save real
    if (PERSISTENCE_OFF) return
    // Sem autosave durante batalha — salva ao derrotar/fugir da horda (endBattle)
    if (get().inBattle) return
    dirty = true
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      if (get().inBattle) return
      get().saveGame()
    }, AUTOSAVE_DELAY)
  },
  saveGame: () => {
    // Modo teste do editor: não escreve nem acende o indicador de save
    if (PERSISTENCE_OFF) return
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    dirty = false
    try {
      const {
        level, xp, pendingLevelUps, statBonuses, skills, hearts, inventory, coins,
        slotLimit, scene, playerPosition, consumedEntities, keys, unlockedDoors,
      } = get()
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          level, xp, pendingLevelUps, statBonuses, skills, hearts, inventory, coins,
          slotLimit,
          scene,
          // Versão do mundo publicado quando o save foi gravado (Fase 3) —
          // loadGame não lê: cena desconhecida já cai no startScene
          worldVersion: useWorldStore.getState().version,
          playerPos: [playerPosition.x, playerPosition.z],
          consumed: Object.keys(consumedEntities),
          keys,
          unlockedDoors: Object.keys(unlockedDoors),
        })
      )
    } catch {
      // localStorage indisponível (modo privado etc.) — ignora silenciosamente
    }
    // Indicador visível por SAVING_FLASH_MS mesmo que a escrita seja instantânea
    set({ saving: true })
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => set({ saving: false }), SAVING_FLASH_MS)
  },
  loadGame: () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return
      const save = JSON.parse(raw)
      if (typeof save.level !== 'number' || typeof save.xp !== 'number') return
      const statBonuses = { ...EMPTY_BONUSES, ...save.statBonuses }
      const level = Math.min(save.level, MAX_LEVEL)
      const maxHearts = deriveStats(level, statBonuses).maxHearts
      const slotLimit =
        typeof save.slotLimit === 'number' ? save.slotLimit : INITIAL_SLOT_LIMIT
      // Cena salva que não existe no mundo atual cai no startScene
      const world = useWorldStore.getState()
      const scene: SceneId =
        typeof save.scene === 'string' && world.hasScene(save.scene)
          ? save.scene
          : world.world.startScene
      // Morreu com o save aberto: volta no respawn da cena com vida cheia
      const died = typeof save.hearts === 'number' && save.hearts <= 0
      const bounds = world.getBounds(scene)
      if (!bounds) return // cena sem bounds não deveria acontecer — ignora o save
      const savedPosValid =
        !died &&
        Array.isArray(save.playerPos) &&
        save.playerPos.length === 2 &&
        typeof save.playerPos[0] === 'number' &&
        typeof save.playerPos[1] === 'number' &&
        Number.isFinite(save.playerPos[0]) &&
        Number.isFinite(save.playerPos[1]) &&
        save.playerPos[0] >= bounds.minX &&
        save.playerPos[0] <= bounds.maxX &&
        save.playerPos[1] >= bounds.minZ &&
        save.playerPos[1] <= bounds.maxZ
      const savedPos = savedPosValid
        ? new Vector3(save.playerPos[0], 0, save.playerPos[1])
        : new Vector3(...(world.getSpawn(scene) ?? ([0, 0, 0] as [number, number, number])))
      const consumedEntities: Record<string, true> = {}
      if (Array.isArray(save.consumed)) {
        for (const id of save.consumed) {
          if (typeof id === 'string') consumedEntities[id] = true
        }
      }
      // Saves antigos não têm chaves/portas — caem no default vazio
      const keys: Record<KeyColor, number> = { silver: 0, gold: 0 }
      if (save.keys && typeof save.keys === 'object') {
        for (const color of KEY_COLOR_IDS) {
          const value = save.keys[color]
          if (typeof value === 'number' && Number.isFinite(value)) {
            keys[color] = Math.max(0, Math.floor(value))
          }
        }
      }
      const unlockedDoors: Record<string, true> = {}
      if (Array.isArray(save.unlockedDoors)) {
        for (const id of save.unlockedDoors) {
          if (typeof id === 'string') unlockedDoors[id] = true
        }
      }
      set({
        scene,
        pendingSpawn: savedPos,
        consumedEntities,
        level,
        xp: save.xp,
        pendingLevelUps:
          typeof save.pendingLevelUps === 'number'
            ? Math.max(0, Math.floor(save.pendingLevelUps))
            : 0,
        statBonuses,
        maxHearts,
        hearts: died ? maxHearts : Math.min(save.hearts ?? maxHearts, maxHearts),
        skills: Array.isArray(save.skills) ? save.skills : [],
        slotLimit,
        coins: typeof save.coins === 'number' ? save.coins : 0,
        keys,
        unlockedDoors,
        inventory: save.inventory
          ? (Object.fromEntries(
              ITEM_IDS.map((id) => [id, Math.min(save.inventory[id] ?? 0, slotLimit)])
            ) as Record<ItemId, number>)
          : get().inventory,
      })
    } catch {
      // Save corrompido — começa do zero
    }
  },
  selectSlot: (slot) => {
    if (slot >= 0 && slot < ITEMS.length) set({ selectedSlot: slot })
  },
  useItem: (slot) => {
    const state = get()
    const item = ITEMS[slot]
    if (
      !item ||
      state.inventory[item.id] <= 0 ||
      state.activeNpc ||
      state.gameOver ||
      state.transition ||
      state.pendingLevelUps > 0
    )
      return false

    const effects: WorldEffect[] = []
    const buffs = state.buffs.filter((b) => b.expiresAt > Date.now())

    switch (item.id) {
      case 'java':
        // Café: stamina cheia + boost de velocidade temporário
        effects.push({ type: 'use' })
        buffs.push({ stat: 'moveSpeed', amount: 0.35, expiresAt: Date.now() + 6000 })
        buffs.push({ stat: 'staminaRegen', amount: 1.5, expiresAt: Date.now() + 6000 })
        break
      case 'csharp':
        effects.push({ type: 'explosion' })
        break
      case 'javascript':
        effects.push({ type: 'use' })
        break
      case 'python':
        effects.push({ type: 'snake' })
        break
    }

    set({
      inventory: { ...state.inventory, [item.id]: state.inventory[item.id] - 1 },
      selectedSlot: slot,
      buffs,
      pendingEffects: [...state.pendingEffects, ...effects],
    })

    // Efeitos diretos no estado
    if (item.id === 'java') get().addStamina(1)
    if (item.id === 'javascript') get().addHeart(1)

    get().queueSave()
    return true
  },
  collectItem: (id, amount = 1) => {
    const state = get()
    const room = state.slotLimit - state.inventory[id]
    const collected = Math.max(0, Math.min(room, amount))
    if (collected > 0) {
      set({ inventory: { ...state.inventory, [id]: state.inventory[id] + collected } })
      get().queueSave()
    }
    return collected
  },
  collectKey: (color) => {
    set((state) => ({ keys: { ...state.keys, [color]: state.keys[color] + 1 } }))
    get().queueSave()
  },
  addCoins: (amount) => {
    set((state) => ({ coins: state.coins + amount }))
    get().queueSave()
  },
  buySlotUpgrade: () => {
    const state = get()
    const cost = slotUpgradeCost(state.slotLimit)
    if (state.coins < cost) return false
    set({ coins: state.coins - cost, slotLimit: state.slotLimit + 1 })
    get().queueSave()
    return true
  },
  consumeEffects: () => {
    const effects = get().pendingEffects
    if (effects.length > 0) set({ pendingEffects: [] })
    return effects
  },
}))

/** Stats efetivos = derivados do nível + bônus + buffs temporários ativos */
export function getEffectiveStats(): StatBlock {
  const { level, statBonuses, buffs } = useGameStore.getState()
  return applyBuffs(deriveStats(level, statBonuses), buffs)
}

// Restaura a progressão salva ao carregar o módulo — pulado no modo teste
// do editor (?world=draft), que nunca toca no save real
if (!PERSISTENCE_OFF) useGameStore.getState().loadGame()

// Flush do save pendente quando a aba fecha ou vai para segundo plano
if (typeof window !== 'undefined') {
  const flush = () => {
    if (dirty) useGameStore.getState().saveGame()
  }
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
