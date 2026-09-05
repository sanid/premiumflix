/**
 * Desktop (Tauri) vs. web differences.
 *
 * The web build reaches two endpoints through Vercel serverless functions:
 * the NZB indexer, which sends no CORS headers, and Premiumize's subtitle host,
 * which is http-only and would be blocked as mixed content. A desktop build has
 * no serverless functions, so those requests go through Tauri's HTTP plugin
 * instead — it runs in Rust, where neither restriction applies. Hosts are
 * allow-listed in src-tauri/capabilities/default.json.
 */

/** True when running inside the Tauri desktop shell. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

type FetchFn = typeof globalThis.fetch

let tauriFetch: FetchFn | null = null
let tauriFetchLoad: Promise<FetchFn | null> | null = null

/**
 * `fetch`, routed through Rust on desktop so it is not subject to CORS or
 * mixed-content rules. Identical to the global `fetch` on the web.
 */
export async function appFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!isTauri()) return fetch(input, init)

  if (!tauriFetch) {
    // Loaded lazily so the web bundle never pulls in the plugin.
    tauriFetchLoad ??= import('@tauri-apps/plugin-http')
      .then((m) => m.fetch as FetchFn)
      .catch(() => null)
    tauriFetch = await tauriFetchLoad
  }
  return (tauriFetch ?? fetch)(input, init)
}
