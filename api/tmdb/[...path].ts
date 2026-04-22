/**
 * Vercel Edge Function — TMDB proxy.
 *
 * Keeps TMDB_API_KEY on the server; the client never sees it.
 * Deploy on Vercel and set:
 *   TMDB_API_KEY    = your-tmdb-key     (server-side, not exposed)
 *   VITE_TMDB_USE_PROXY = true          (tells the client to route through here)
 */

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'TMDB_API_KEY not configured on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)

  // Strip the /api/tmdb/ prefix to get the TMDB path
  const match = url.pathname.match(/\/api\/tmdb\/(.+)/)
  const tmdbPath = match?.[1] ?? ''

  const target = new URL(`https://api.themoviedb.org/3/${tmdbPath}`)
  target.searchParams.set('api_key', apiKey)

  // Forward all query params from the client (language, include_image_language, etc.)
  for (const [k, v] of url.searchParams) {
    target.searchParams.set(k, v)
  }

  const response = await fetch(target.toString(), {
    headers: { 'User-Agent': 'notflix/1.0' },
  })

  const body = await response.text()

  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
    },
  })
}
