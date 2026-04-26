/**
 * Dev-only logger. Calls are stripped by bundlers in production.
 */
export function debugLog(...args: unknown[]) {
  if (import.meta.env.DEV) {
    console.log(...args)
  }
}

export function debugWarn(...args: unknown[]) {
  if (import.meta.env.DEV) {
    console.warn(...args)
  }
}
