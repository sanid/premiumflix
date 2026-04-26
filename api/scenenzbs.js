/**
 * Vercel Serverless Function — SceneNZBs proxy.
 * Handles all requests to /api/scenenzbs
 *
 * Set in Vercel project → Environment Variables:
 *   SCENENZBS_API_KEY = your-api-key   (server-side only, never sent to client)
 *
 * The key is added server-side so it's never exposed to the browser.
 */

export default async function handler(req, res) {
  const apiKey = process.env.SCENENZBS_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'SCENENZBS_API_KEY not configured on server' })
  }

  // Build the upstream URL: https://scenenzbs.com/api?apikey=...&...
  const target = new URL('https://scenenzbs.com/api')
  target.searchParams.set('apikey', apiKey)
  target.searchParams.set('o', 'json')

  // Forward all query params from the client (t, q, tmdbid, season, episode, etc.)
  for (const [k, v] of Object.entries(req.query ?? {})) {
    target.searchParams.set(k, Array.isArray(v) ? v[0] : v ?? '')
  }

  const response = await fetch(target.toString(), {
    headers: { 'User-Agent': 'premiumflix/1.0' },
  })

  const body = await response.text()

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60')
  return res.status(response.status).send(body)
}
