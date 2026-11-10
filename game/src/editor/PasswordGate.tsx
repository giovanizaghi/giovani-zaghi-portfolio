import { useState, type ReactNode } from 'react'

/**
 * Porta de entrada do editor: se `VITE_EDITOR_PASSWORD` estiver definida,
 * exige a senha uma vez por sessão (sessionStorage). Sem a env, passa direto.
 */

const SESSION_KEY = 'editor-unlocked'

export function PasswordGate({ children }: { children: ReactNode }) {
  const required = import.meta.env.VITE_EDITOR_PASSWORD as string | undefined

  // Sem senha configurada → editor liberado
  if (!required) return <>{children}</>

  return <Gate required={required}>{children}</Gate>
}

function Gate({ required, children }: { required: string; children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1'
    } catch {
      return false
    }
  })
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  if (unlocked) return <>{children}</>

  const submit = () => {
    if (value === required) {
      try {
        sessionStorage.setItem(SESSION_KEY, '1')
      } catch {
        // sem sessionStorage — libera só nesta montagem
      }
      setUnlocked(true)
    } else {
      setError(true)
      setValue('')
    }
  }

  return (
    <div className="gate">
      <form
        className="gate-card"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h1>Editor de níveis</h1>
        <p>Digite a senha de acesso:</p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(false)
          }}
          placeholder="senha"
        />
        {error && <p className="gate-error">Senha incorreta</p>}
        <button type="submit">Entrar</button>
      </form>
    </div>
  )
}
