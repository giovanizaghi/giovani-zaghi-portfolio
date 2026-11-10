import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useEditorStore } from '../useEditorStore'
import type { FieldDef } from '../entityDefs'
import { getDot } from '../ops'
import type { Entity } from '../../data/world'

/**
 * Inputs reutilizáveis do inspector — todos commitam via `setEntityField`
 * (ou callback equivalente). Campos de texto/número commitam no blur/Enter
 * para não gerar um passo de undo por tecla; select/checkbox/cor commitam
 * na mudança.
 */

// ---- Primitivos com rascunho local (commit no blur/Enter) ----

interface DraftProps {
  value: string
  onCommit: (text: string) => void
  placeholder?: string
  className?: string
}

/** Texto livre — commita ao sair do campo ou no Enter */
export function DraftText({ value, onCommit, placeholder, className }: DraftProps) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return (
    <input
      className={className}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        e.stopPropagation()
      }}
    />
  )
}

interface DraftNumberProps extends DraftProps {
  min?: number
  max?: number
  step?: number
}

/** Número — mesmo padrão do DraftText; vazio em campo opcional = undefined */
export function DraftNumber({ value, onCommit, placeholder, min, max, step }: DraftNumberProps) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft === value) return
    onCommit(draft)
  }
  return (
    <input
      type="number"
      value={draft}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        e.stopPropagation()
      }}
    />
  )
}

// ---- Campos por kind ----

interface FieldProps {
  field: FieldDef
  /** Valor atual lido por getDot(entity, field.key) */
  value: unknown
  onCommit: (value: unknown) => void
  /** Entidade editada — usada pelo spawnPicker (startPick pelo id) */
  entity: Entity
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function EntityField({ field, value, onCommit, entity }: FieldProps) {
  const world = useEditorStore((s) => s.world)
  const label = (
    <label className="field">
      <span className="field-label">{field.label}</span>
      {renderInput()}
    </label>
  )
  return label

  function renderInput(): ReactNode {
    switch (field.kind) {
      case 'number':
        return (
          <DraftNumber
            value={value === undefined ? '' : String(num(value))}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step}
            onCommit={(text) => {
              if (text.trim() === '') {
                if (field.optional) onCommit(undefined)
                return
              }
              const n = Number(text)
              if (Number.isFinite(n)) onCommit(n)
            }}
          />
        )

      case 'text':
        return (
          <DraftText
            value={str(value)}
            placeholder={field.placeholder}
            onCommit={(text) => {
              if (field.optional && text === '') onCommit(undefined)
              else onCommit(text)
            }}
          />
        )

      case 'color':
        return (
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(str(value)) ? str(value) : '#ffffff'}
            onChange={(e) => onCommit(e.target.value)}
          />
        )

      case 'bool':
        return (
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => {
              if (field.optional && !e.target.checked) onCommit(undefined)
              else onCommit(e.target.checked)
            }}
          />
        )

      case 'select': {
        const current = str(value)
        return (
          <select
            value={current}
            onChange={(e) => {
              const v = e.target.value
              if (field.optional && v === '') onCommit(undefined)
              else onCommit(v)
            }}
          >
            {field.optional && <option value="">—</option>}
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      }

      case 'vec3':
        return <Vec3Editor value={value} optional={field.optional} onCommit={onCommit} />

      case 'scene': {
        const current = str(value)
        return (
          <select
            value={current}
            onChange={(e) => {
              const v = e.target.value
              if (field.optional && v === '') onCommit(undefined)
              else onCommit(v)
            }}
          >
            {field.optional && <option value="">— mesma cena —</option>}
            {Object.keys(world.scenes).map((id) => (
              <option key={id} value={id}>
                {world.scenes[id].name} ({id})
              </option>
            ))}
          </select>
        )
      }

      case 'dialogue': {
        const current = str(value)
        const ids = Object.keys(world.dialogues)
        return (
          <span className="field-inline">
            <select
              value={current}
              onChange={(e) => onCommit(e.target.value)}
            >
              {current === '' && <option value="">— sem diálogo —</option>}
              {ids.map((id) => (
                <option key={id} value={id}>
                  {world.dialogues[id].name} ({id})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="mini-btn"
              title="Abrir na aba Diálogos"
              onClick={() => {
                useEditorStore.getState().setEditingDialogue(current || null)
                useEditorStore.getState().setPaletteTab('dialogues')
              }}
            >
              editar
            </button>
          </span>
        )
      }

      case 'spawnPicker':
        return (
          <SpawnPicker
            value={value}
            optional={field.optional}
            entity={entity}
            onCommit={onCommit}
          />
        )
    }
  }
}

// ---- Vec3 ----

function Vec3Editor({
  value,
  optional,
  onCommit,
}: {
  value: unknown
  optional?: boolean
  onCommit: (v: unknown) => void
}) {
  // Cada eixo commita independente no blur/Enter — o valor montado usa os
  // outros eixos do valor externo atual. Opcional + eixo esvaziado → remove
  // a chave inteira (undefined); inválido/parcial não commita nada.
  const base = Array.isArray(value) ? [...value] : [0, 0, 0]

  const commitAxis = (i: number, text: string) => {
    if (text.trim() === '') {
      if (optional) {
        onCommit(undefined)
        return
      }
      base[i] = 0
    } else {
      const n = Number(text)
      if (!Number.isFinite(n)) return
      base[i] = n
    }
    onCommit([base[0], base[1], base[2]])
  }

  return (
    <span className="vec3">
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <DraftNumber
          key={axis}
          value={Array.isArray(value) ? String(value[i] ?? 0) : ''}
          placeholder={Array.isArray(value) ? undefined : '0'}
          step={0.1}
          onCommit={(text) => commitAxis(i, text)}
        />
      ))}
      <span className="vec3-axes">{optional ? '(vazio remove)' : ''}</span>
    </span>
  )
}

// ---- Spawn picker (toSpawn de porta/transporte) ----

function SpawnPicker({
  value,
  optional,
  entity,
  onCommit,
}: {
  value: unknown
  optional?: boolean
  entity: Entity
  onCommit: (v: unknown) => void
}) {
  const startPick = useEditorStore((s) => s.startPick)
  const arr = Array.isArray(value) ? value : null
  const hasValue = arr !== null

  return (
    <span className="spawn-picker">
      <DraftNumber
        value={hasValue ? String(arr[0]) : ''}
        placeholder="x"
        step={0.5}
        onCommit={(text) => {
          const x = text === '' ? 0 : Number(text)
          const z = hasValue ? arr[2] : 0
          if (text === '' && optional) onCommit(undefined)
          else if (Number.isFinite(x)) onCommit([x, 0, z])
        }}
      />
      <DraftNumber
        value={hasValue ? String(arr[2]) : ''}
        placeholder="z"
        step={0.5}
        onCommit={(text) => {
          const z = text === '' ? 0 : Number(text)
          const x = hasValue ? arr[0] : 0
          if (text === '' && optional) onCommit(undefined)
          else if (Number.isFinite(z)) onCommit([x, 0, z])
        }}
      />
      <button
        type="button"
        className="mini-btn"
        title="Escolher o ponto no mapa da cena destino"
        onClick={() => startPick(entity.id)}
      >
        escolher no mapa
      </button>
      {!hasValue && optional && <span className="field-hint">vazio = mesma cena</span>}
    </span>
  )
}

/** Lê o valor de um FieldDef direto da entidade (para o Inspector) */
export function fieldValue(entity: Entity, key: string): unknown {
  return getDot(entity, key)
}
