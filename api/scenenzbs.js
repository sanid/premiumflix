/**
 * Vercel Serverless Function — SceneNZBs proxy.
 * Handles all requests to /api/scenenzbs
 *
 * SceneNZBs rebranded to Treasure Maps; scenenzbs.com now only serves a
 * "we have moved" HTML page. The API and the existing keys are unchanged.
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

  // Build the upstream URL: https://treasure-maps.com/api?apikey=...&...
  const target = new URL('https://treasure-maps.com/api')
  target.searchParams.set('apikey', apiKey)
  target.searchParams.set('o', 'json')

  // Forward all query params from the client (t, q, tmdbid, season, episode, etc.)
  for (const [k, v] of Object.entries(req.query ?? {})) {
    target.searchParams.set(k, Array.isArray(v) ? v[0] : v ?? '')
  }

  let response
  let body
  try {
    response = await fetch(target.toString(), {
      headers: { 'User-Agent': 'premiumflix/1.0' },
    })
    body = await response.text()
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach the NZB indexer: ' + e.message })
  }

  // Never label the upstream body as JSON without checking. The indexer serves
  // an HTML page when it has moved or is down, and forwarding that under an
  // application/json header surfaces to the client as a JSON parse error
  // ("Unexpected token '<'") instead of something actionable.
  const upstreamType = response.headers.get('content-type') ?? ''
  if (!upstreamType.includes('json') && !upstreamType.includes('xml')) {
    return res.status(502).json({
      error: 'NZB indexer returned a non-API response (HTTP ' + response.status + ', ' +
        (upstreamType || 'unknown content type') + '). The service may have moved or be down.',
    })
  }

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60')
  return res.status(response.status).send(body)
}
