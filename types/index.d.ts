export type Ventana = { percentUsed: number; resetsAt?: string }

export type Foto = {
  /** Cuando se tomo la foto, en ms. */
  at: number
  ctxTokens?: number
  ctxWindow: number
  ctxPercent?: number
  cinco?: Ventana
  semana?: Ventana
}

/** Una muestra del historial de consumo (para la grafica en vivo). */
export type Muestra = { t: number; ctx?: number; cinco?: number; semana?: number }

/** Estado de vuelo (estilo flightdeck): turno, permisos y agentes. */
export type Permiso = { id: string; v: 'rule' | 'ask' | 'cleared' | 'deny' }
export type Vuelo = {
  trabajando: boolean
  inicio: number
  modelo: string
  esfuerzo: string
  peticiones: number
  coste: number | null
  permisos: Permiso[]
  agentes: Record<string, 'running' | 'done' | 'failed'>
  ultimo: { ms: number; ok: boolean } | null
}

declare module 'claude-code' {
  interface PluginState {
    'radar-consumo': { foto: Foto | null; ultimaRespuesta: number | null; historial: Muestra[]; fallo: string | null; vuelo: Vuelo }
  }
}
