import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionCost, SessionRateLimit } from 'claude-code'

import type { Meter } from '../types'

const PANE = 'credit-meter'
const TITLE = 'クレジット使用量'
const meter = atom({ plugin: 'credit-meter', key: 'meter' } as const, { limits: [] } as Meter, {
  shape: 'meter-1',
})
// Rate-limit windows already warned about at a threshold, e.g. "five_hour:80".
const warned = atom({ plugin: 'credit-meter', key: 'warned' } as const, [] as string[], {
  shape: 'warned-1',
})
const THRESHOLDS = [80, 90, 100]

const LABELS: Record<string, string> = {
  five_hour: '5時間枠',
  seven_day: '7日間枠',
  spend_limit: '利用上限',
}

const label = (kind: string) => LABELS[kind] ?? kind
const usd = (n?: number) => (n === undefined ? '—' : `$${n.toFixed(n < 1 ? 3 : 2)}`)
const bar = (pct: number, width = 20) => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
const resets = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `リセット ${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Figures = { cost?: SessionCost; rateLimits: SessionRateLimit[]; context: { percent?: number } }

const record = async ($: EngineInterface, f: Figures) => {
  const next: Meter = {
    usd: f.cost?.usd,
    limits: f.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    contextPercent: f.context.percent,
  }
  await update($, meter, () => next)

  const parts = [`💳 ${usd(next.usd)}`]
  for (const l of next.limits) parts.push(`${label(l.kind)} ${l.percentUsed}%`)
  await $.ui.status(parts.join(' · '))

  const seen = await read($, warned)
  const fresh: string[] = []
  for (const l of next.limits) {
    for (const t of THRESHOLDS) {
      const k = `${l.kind}:${t}`
      if (l.percentUsed >= t && !seen.includes(k)) {
        fresh.push(k)
      }
    }
    const top = THRESHOLDS.filter(t => l.percentUsed >= t && !seen.includes(`${l.kind}:${t}`)).pop()
    if (top !== undefined) {
      await $.ui.toast(`⚠️ ${label(l.kind)}の使用量が${l.percentUsed}%に達しました ${resets(l.resetsAt)}`)
    }
  }
  // A window that dropped back below a threshold (it reset) may warn again.
  const kept = seen.filter(k => {
    const [kind, t] = k.split(':')
    const l = next.limits.find(x => x.kind === kind)
    return l !== undefined && l.percentUsed >= Number(t)
  })
  if (fresh.length > 0 || kept.length !== seen.length) {
    await update($, warned, () => [...kept, ...fresh])
  }
}

// The band above the prompt (AbovePrompt) is drawn on terminal and desktop
// only. Elsewhere (mobile, web, VS Code) a compact pane, which those surfaces
// seat above the prompt, stands in for it.
const BAND_SURFACES = ['terminal', 'desktop']
const ensurePane = async ($: EngineInterface) => {
  const surfaces = await $.session.surfaces()
  if (!surfaces.some(s => !BAND_SURFACES.includes(s))) return
  if ((await $.ui.panes()).some(p => p.id === PANE)) return
  await $.ui.open({ id: PANE, title: TITLE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({
      name: 'credits',
      description: 'クレジット（コスト・レート制限）の使用量をペインに表示',
    })
    await record($, await $.session.usage())
    await ensurePane($)

    return ran
  })

  on('session.attach', async ($, e, next) => {
    const ran = await next(e)
    await ensurePane($)

    return ran
  })

  on('session.measure', async ($, e, next) => {
    await record($, e)
    await ensurePane($)

    return next(e)
  })

  on('command.run', { command: 'credits' }, async $ => {
    const now = await $.session.usage()
    await record($, now)
    await $.ui.open({ id: PANE, title: TITLE })
    const lines = [`セッションのコスト: ${usd(now.cost?.usd)}`]
    for (const l of now.rateLimits) lines.push(`${label(l.kind)}: ${l.percentUsed}% ${resets(l.resetsAt)}`)
    if (now.context.percent !== undefined) lines.push(`コンテキスト: ${now.context.percent}%`)

    return { text: lines.join('\n') }
  })

  // Always-on one-line band above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, meter)
    const color = (p: number) => (p >= 90 ? 'red' : p >= 70 ? 'yellow' : 'green')

    return (
      <Box>
        <Text>💳 {usd(m.usd)}</Text>
        {m.limits.map(l => (
          <Text color={color(l.percentUsed)}>
            {'  '}
            {label(l.kind)} {bar(l.percentUsed, 10)} {l.percentUsed}%
          </Text>
        ))}
        {m.contextPercent !== undefined && (
          <Text color={color(m.contextPercent)}>
            {'  '}コンテキスト {m.contextPercent}%
          </Text>
        )}
        {m.limits.length === 0 && <Text dimColor>{'  '}レート制限は最初の応答後に表示</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, meter)
    const width = Math.max(6, Math.min(20, (e.props.bodyColumns ?? 40) - 34))
    const color = (p: number) => (p >= 90 ? 'red' : p >= 70 ? 'yellow' : 'green')

    return (
      <Box flexDirection="column">
        <Text>
          💳 {usd(m.usd)}
          {m.contextPercent !== undefined ? `  コンテキスト ${m.contextPercent}%` : ''}
        </Text>
        {m.limits.length === 0 && <Text dimColor>レート制限は最初の応答後に表示</Text>}
        {m.limits.map(l => (
          <Text color={color(l.percentUsed)}>
            {label(l.kind)} {bar(l.percentUsed, width)} {l.percentUsed}% {resets(l.resetsAt)}
          </Text>
        ))}
      </Box>
    )
  })
}
