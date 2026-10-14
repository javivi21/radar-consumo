import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Foto, Muestra, Permiso, Ventana, Vuelo } from '../types'

// Cada cuanto se relee el uso (ms) y cuanto dura la cache del prompt (min).
// La cache de 1 h es la de esta cuenta; es una ESTIMACION desde la ultima respuesta.
const CADA_MS = 15_000
const CACHE_MIN = 60
// Grafica en vivo: ventana de historial (min) y columnas que se dibujan.
const VENTANA_MIN = 30
const COLUMNAS = 15
// El ritmo de gasto se calcula con los ultimos minutos.
const RITMO_MIN = 10

const foto = atom({ plugin: 'radar-consumo', key: 'foto' } as const, null)
const ultimaRespuesta = atom({ plugin: 'radar-consumo', key: 'ultimaRespuesta' } as const, null)
const historial = atom({ plugin: 'radar-consumo', key: 'historial' } as const, [])
const fallo = atom({ plugin: 'radar-consumo', key: 'fallo' } as const, null)
const VUELO0: Vuelo = {
  trabajando: false,
  inicio: 0,
  modelo: '',
  esfuerzo: '',
  peticiones: 0,
  coste: null,
  permisos: [],
  agentes: {},
  ultimo: null,
}
const vuelo = atom({ plugin: 'radar-consumo', key: 'vuelo' } as const, VUELO0)

// Lectura segura: un estado guardado con forma antigua se completa con los valores por defecto.
const leerVuelo = async ($: Parameters<typeof read>[0]): Promise<Vuelo> => ({ ...VUELO0, ...((await read($, vuelo)) ?? {}) })

// Metal por nivel: acero en calma, champán desde el 60 %, amarillo vivo desde el 80 %, rojo intenso desde el 90 %.
const PALETA = {
  calma: ['#6f86a8', '#c7d3e6'],
  medio: ['#b89a6a', '#f0dfbd'],
  aviso: ['#e0a612', '#ffe27a'],
  critico: ['#e5283a', '#ff8f8a'],
} as const

const paleta = (pct: number | undefined) =>
  pct === undefined || pct < 60 ? PALETA.calma : pct >= 90 ? PALETA.critico : pct >= 80 ? PALETA.aviso : PALETA.medio

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))

const mezcla = (a: string, b: string, t: number) => {
  const x = rgb(a)
  const y = rgb(b)
  return `#${[0, 1, 2].map(i => Math.round((x[i] ?? 0) + ((y[i] ?? 0) - (x[i] ?? 0)) * t).toString(16).padStart(2, '0')).join('')}`
}

const bonito = (id: string) => {
  if (!id) return '—'
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?/i.exec(id)
  if (m?.[1]) return `${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
  return id.slice(0, 22)
}

const crono = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

const color = (pct: number | undefined) =>
  pct === undefined ? undefined : pct >= 90 ? '#ff5a5f' : pct >= 80 ? '#ffd23f' : pct >= 60 ? '#d9c3a0' : '#8fa4c0'

const kilos = (n: number | undefined) => (n === undefined ? '?' : `${Math.round(n / 1000)}k`)

const resta = (ms: number) => {
  const min = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(min / 60)
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`
}

const ventana = (v: Ventana | undefined, ahora: number) =>
  v === undefined
    ? undefined
    : {
        pct: v.percentUsed,
        reinicio: v.resetsAt ? resta(new Date(v.resetsAt).getTime() - ahora) : undefined,
      }

const BARRAS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

// Dibuja una serie 0-100 como barras. Columnas sin dato se dejan en blanco.
const spark = (valores: (number | undefined)[]) =>
  valores
    .map(v => (v === undefined ? ' ' : BARRAS[Math.min(7, Math.max(0, Math.floor((v / 100) * 8)))]))
    .join('')

// Reparte el historial en COLUMNAS cubos de tiempo y arrastra el ultimo valor conocido.
const serie = (h: Muestra[], ahora: number, campo: 'ctx' | 'cinco' | 'semana') => {
  const ini = ahora - VENTANA_MIN * 60000
  const paso = (VENTANA_MIN * 60000) / COLUMNAS
  const out: (number | undefined)[] = Array(COLUMNAS).fill(undefined)
  let ultimo: number | undefined
  const previas = h.filter(m => m.t < ini && m[campo] !== undefined)
  if (previas.length) ultimo = previas.at(-1)?.[campo]
  for (let i = 0; i < COLUMNAS; i++) {
    const dentro = h.filter(m => m.t >= ini + i * paso && m.t < ini + (i + 1) * paso && m[campo] !== undefined)
    if (dentro.length) ultimo = dentro.at(-1)?.[campo]
    out[i] = ultimo
  }
  return out
}

// Ritmo en puntos de % por hora, con las muestras de los ultimos RITMO_MIN minutos.
const ritmo = (h: Muestra[], ahora: number, campo: 'cinco' | 'semana') => {
  const m = h.filter(x => x.t >= ahora - RITMO_MIN * 60000 && x[campo] !== undefined)
  if (m.length < 2) return undefined
  const a = m[0]
  const b = m.at(-1)
  if (a === undefined || b === undefined) return undefined
  const horas = (b.t - a.t) / 3600000
  if (horas <= 0) return undefined
  return ((b[campo] as number) - (a[campo] as number)) / horas
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const leer = async () => {
      try {
        const u = await $.session.usage()
        const t = await $.clock.now()
        const cinco = u.rateLimits.find(r => r.kind === 'five_hour')
        const semana = u.rateLimits.find(r => r.kind === 'seven_day')
        const f: Foto = {
          at: t,
          ctxTokens: u.context.tokens,
          ctxWindow: u.context.window,
          ctxPercent: u.context.percent,
          cinco,
          semana,
        }
        await update($, foto, () => f)
        await update($, vuelo, v => ({ ...VUELO0, ...(v ?? {}), coste: u.cost?.usd ?? null }))
        const muestra: Muestra = {
          t,
          ctx: u.context.percent,
          cinco: cinco?.percentUsed,
          semana: semana?.percentUsed,
        }
        const corte = t - (VENTANA_MIN + 5) * 60000
        await update($, historial, h => [...h.filter(m => m.t >= corte), muestra])
        await update($, fallo, () => null)
      } catch (err) {
        // Se reintenta en el siguiente ciclo; el motivo se ensena en la franja.
        await update($, fallo, () => String(err).slice(0, 120))
      }
    }

    $.ui.toast('radar-consumo cargado')
    void leer()
    $.clock.every(CADA_MS, () => {
      void leer()
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const t = await $.clock.now()
    const id = e.agentId
    if (!id) {
      await update($, ultimaRespuesta, () => t)
      await update($, vuelo, x => ({
        ...VUELO0,
        ...(x ?? {}),
        trabajando: false,
        ultimo: { ms: e.durationMs, ok: e.reason === 'answer' },
      }))
    } else {
      await update($, vuelo, (x): Vuelo => {
        const y = { ...VUELO0, ...(x ?? {}) }
        return y.agentes[id] === undefined
          ? y
          : { ...y, agentes: { ...y.agentes, [id]: e.reason === 'answer' ? 'done' : 'failed' } }
      })
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const t = await $.clock.now()
    await update($, vuelo, v => ({ ...VUELO0, ...(v ?? {}), trabajando: true, inicio: t, permisos: [] }))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      await update($, vuelo, v => {
        const x = { ...VUELO0, ...(v ?? {}) }
        return { ...x, modelo: e.model, esfuerzo: String(e.effort ?? x.esfuerzo), peticiones: x.peticiones + 1 }
      })
    }
    return yield* next(e)
  })

  on('tool.check', async ($, e, next) => {
    const veredicto = await next(e)
    if (e.tool_use_id) {
      const id = e.tool_use_id
      const v: Permiso['v'] = veredicto.decision === 'allow' ? 'rule' : veredicto.decision === 'deny' ? 'deny' : 'ask'
      await update($, vuelo, x => ({ ...VUELO0, ...(x ?? {}), permisos: [...(x?.permisos ?? []), { id, v }].slice(-40) }))
    }
    return veredicto
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const id = e.tool_use_id
    const ok = ran.deny === undefined
    await update($, vuelo, (x): Vuelo => ({
      ...VUELO0,
      ...(x ?? {}),
      permisos: (x?.permisos ?? []).map(p => (p.id === id && p.v === 'ask' ? { id, v: ok ? 'cleared' : 'deny' } : p)),
    }))
    return ran
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny === undefined && started.agentId) {
      const id = started.agentId
      await update($, vuelo, (x): Vuelo => ({ ...VUELO0, ...(x ?? {}), agentes: { ...(x?.agentes ?? {}), [id]: 'running' } }))
    }
    return started
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, foto)
    if (e.props.hasSurvey) return next(e)
    if (f === null) {
      const motivo = await read($, fallo)
      const { Box: Caja, Text: Texto } = $.ui.resolve(e)
      return (
        <Caja>
          <Texto dimColor>radar-consumo: {motivo ? `sin datos (${motivo})` : 'leyendo el uso...'}</Texto>
        </Caja>
      )
    }

    const ahora = await $.clock.now()
    const ultima = await read($, ultimaRespuesta)
    const hist = await read($, historial)
    const cinco = ventana(f.cinco, ahora)
    const semana = ventana(f.semana, ahora)

    const cacheMin = ultima ? CACHE_MIN - (ahora - ultima) / 60000 : undefined
    const cacheTxt =
      cacheMin === undefined ? 'sin datos' : cacheMin > 0 ? `${Math.round(cacheMin)} min` : 'caducada'
    const cacheColor = cacheMin === undefined ? undefined : cacheMin > 10 ? '#9fb4d6' : cacheMin > 0 ? '#ffd23f' : '#ff5a5f'

    // Grafica en vivo: arriba, sobre la linea de siempre.
    const rCinco = ritmo(hist, ahora, 'cinco')
    const restoCinco = f.cinco ? 100 - f.cinco.percentUsed : undefined
    let eta = 'sin datos aun'
    if (rCinco !== undefined) {
      if (rCinco <= 0.05) eta = 'estable'
      else if (restoCinco !== undefined) {
        const horas = restoCinco / rCinco
        const reinicioMs = f.cinco?.resetsAt ? new Date(f.cinco.resetsAt).getTime() - ahora : undefined
        const llegaAntes = reinicioMs === undefined || horas * 3600000 < reinicioMs
        eta = `+${rCinco.toFixed(1)}%/h ${llegaAntes ? `limite en ${resta(horas * 3600000)}` : 'sin riesgo'}`
      }
    }
    const sCinco = spark(serie(hist, ahora, 'cinco'))
    const sCtx = spark(serie(hist, ahora, 'ctx'))

    const { Box, Text } = $.ui.resolve(e)
    const vl = await leerVuelo($)
    const agentes = Object.values(vl.agentes)
    const agCorriendo = agentes.filter(a => a === 'running').length
    const perm = {
      ok: vl.permisos.filter(p => p.v === 'rule').length,
      auto: vl.permisos.filter(p => p.v === 'cleared').length,
      ask: vl.permisos.filter(p => p.v === 'ask').length,
      no: vl.permisos.filter(p => p.v === 'deny').length,
    }
    const colPerm = (p: Permiso) =>
      p.v === 'rule' ? 'success' : p.v === 'cleared' ? 'permission' : p.v === 'ask' ? 'warning' : 'error'
    // Barra en cápsula biselada: luz arriba, sombra abajo, punta brillante, color según el nivel.
    const barra = (pct: number, ancho = 9) => {
      const pal = paleta(pct)
      const lleno = pct > 0 ? Math.max(1, Math.min(ancho, Math.round((pct / 100) * ancho))) : 0
      const celdas = Array.from({ length: lleno }, (_, i) => {
        const base = mezcla(pal[0], pal[1], i / (lleno - 1 || 1))
        const punta = i === lleno - 1
        return (
          <Text
            key={`b${i}`}
            color={punta ? '#ffffff' : mezcla(base, '#ffffff', 0.45)}
            backgroundColor={punta ? mezcla(base, '#ffffff', 0.2) : mezcla(base, '#000000', 0.28)}
          >
            ▀
          </Text>
        )
      })
      return [
        <Text key="ini" color={pal[0]}>◖</Text>,
        ...celdas,
        <Text key="vacio" color="#3a404c" backgroundColor="#23272f">{'▀'.repeat(ancho - lleno)}</Text>,
        <Text key="fin" color="#3a404c">◗</Text>,
      ]
    }
    const quedan = f.ctxTokens === undefined ? undefined : f.ctxWindow - f.ctxTokens

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
        <Box justifyContent="space-between">
          <Text dimColor>
            {new Date(ahora).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
            {' · '}
            {new Date(ahora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text color="claude" bold>
            {bonito(vl.modelo)} · principal
          </Text>
          <Text color={vl.trabajando ? 'claude' : undefined} dimColor={!vl.trabajando}>
            {vl.trabajando ? `● trabajando ${crono(ahora - vl.inicio)}` : '○ en espera'}
          </Text>
        </Box>
        <Box>
          <Text dimColor>30m · 5h </Text>
          <Text color={color(f.cinco?.percentUsed)}>{sCinco}</Text>
          <Text dimColor> | ctx </Text>
          <Text color={color(f.ctxPercent)}>{sCtx}</Text>
          <Text dimColor> | </Text>
          <Text color={rCinco !== undefined && rCinco > 0.05 ? '#d9c3a0' : '#9fd0c7'}>{eta}</Text>
        </Box>
        <Box flexWrap="nowrap">
          <Text dimColor>ctx </Text>
          {barra(f.ctxPercent ?? 0)}
          <Text color={color(f.ctxPercent)} bold>{` ${f.ctxPercent ?? '?'}%`}</Text>
          <Text dimColor> {kilos(f.ctxTokens)}/{kilos(f.ctxWindow)}</Text>
          <Text dimColor> │ 5h </Text>
          {barra(cinco?.pct ?? 0)}
          <Text color={color(cinco?.pct)} bold>{` ${cinco ? `${cinco.pct}%` : '?'}`}</Text>
          <Text dimColor>{cinco?.reinicio ? ` ↻${cinco.reinicio.replace(/ /g, '')}` : ''}</Text>
          <Text dimColor> │ sem </Text>
          {barra(semana?.pct ?? 0)}
          <Text color={color(semana?.pct)} bold>{` ${semana ? `${semana.pct}%` : '?'}`}</Text>
          <Text dimColor> │ </Text>
          <Text color={cacheColor}>caché {cacheTxt.replace(' min', 'm')}</Text>
        </Box>
        <Box justifyContent="space-between">
          <Box>
            <Text dimColor>permisos </Text>
            {vl.permisos.length === 0 ? <Text color="subtle">sin comprobaciones</Text> : null}
            {vl.permisos.slice(-24).map(p => (
              <Text color={colPerm(p)}>{p.v === 'deny' ? '✗' : '■'}</Text>
            ))}
            <Text dimColor>
              {` ${perm.ok} ok · ${perm.auto} auto${perm.ask > 0 ? ` · ${perm.ask} pendientes` : ''} · `}
            </Text>
            <Text color={perm.no > 0 ? 'error' : undefined} dimColor={perm.no === 0}>{perm.no} denegados</Text>
            <Text dimColor> | </Text>
            <Text color={agCorriendo > 0 ? 'suggestion' : undefined} dimColor={agCorriendo === 0}>
              agentes {agCorriendo}/{agentes.length}
            </Text>
            {vl.ultimo ? (
              <Text dimColor>
                {' | último turno '}
                <Text color={vl.ultimo.ok ? 'success' : 'error'}>{vl.ultimo.ok ? '✓' : '✗'}</Text>
                {` ${crono(vl.ultimo.ms)}`}
              </Text>
            ) : null}
          </Box>
        </Box>
      </Box>
    )
  })
}
