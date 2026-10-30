export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Meter = {
  usd?: number
  limits: Limit[]
  contextPercent?: number
}

declare module 'claude-code' {
  interface PluginState {
    'credit-meter': { meter: Shaped<Meter>; warned: Shaped<string[]> }
  }
}
