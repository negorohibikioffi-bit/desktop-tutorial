import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'credit-meter',
  component: 'Pane',
  requestId: 'credit-meter',
  props: {
    title: 'クレジット使用量',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the pane shows cost and rate limits after a measurement', async ($, on) => {
  on('command.register', () => ({ value: { command: 'credits' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000 }, rateLimits: [], cost: { usd: 0 } },
  }))
  on('session.surfaces', () => ({ value: ['mobile'] }))
  on('ui.panes', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 200000, tokens: 50000, percent: 25 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 42 }],
    cost: { usd: 1.234 },
    changed: ['cost', 'rateLimits', 'context'],
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /💳/ }))?.text).toBe('💳 $1.23  コンテキスト 25%')
    expect((await ui.find({ type: 'Text', text: /5時間枠/ }))?.text).toContain('42%')
    await ui.unmount()
  }
})

test('the band above the prompt is always shown', async ($, on) => {
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.surfaces', () => ({ value: ['desktop'] }))

  const band = { plugin: 'credit-meter', component: 'AbovePrompt', props: { hasSurvey: false } } as const
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...band, surface } as never)
    expect((await ui.find({ type: 'Text', text: /💳/ }))?.text).toBe('💳 —')
    await ui.unmount()
  }

  await $.session.measure({
    context: { window: 200000, percent: 10 },
    rateLimits: [{ kind: 'seven_day', percentUsed: 75 }],
    cost: { usd: 0.5 },
    changed: ['cost', 'rateLimits'],
  })
  const ui = await $.ui.mount({ ...band, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /💳/ }))?.text).toBe('💳 $0.500')
  expect((await ui.find({ type: 'Text', text: /7日間枠/ }))?.text).toContain('75%')
  await ui.unmount()
})
