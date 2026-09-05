/**
 * Vercel Serverless Function — subtitle download proxy.
 * Handles GET /api/subtitles?src=<encoded-url>
 *
 * Premiumize's subtitle links (pmsubs.prmapps.com) are http-only, so the
 * browser would block them as mixed content on the https site. This function
 * fetches them server-side and streams the plain-text SRT back.
 *
 * Only allowlisted hosts are proxied.
 */

const ALLOWED_HOSTS = new Set([
  'pmsubs.prmapps.com',
  'dl.opensubtitles.org',
  'www.opensubtitles.org',
])

export default async function handler(req, res) {
  const src = req.query.src
  if (!src) {
    return res.status(400).json({ error: 'Missing src parameter' })
  }

  let target
  try {
    target = new URL(src)
  } catch {
    return res.status(400).json({ error: 'Invalid src parameter' })
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return res.status(400).json({ error: 'Unsupported protocol' })
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return res.status(403).json({ error: 'Host not allowed' })
  }

  try {
    const response = await fetch(target.toString(), {
      headers: { 'User-Agent': 'premiumflix/1.0' },
    })
    const body = await response.text()

    res.status(response.status)
    res.setHeader('Content-Type', response.headers.get('content-type') ?? 'text/plain; charset=utf-8')
    // Subtitle downloads are immutable content-addressed links
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=600')
    return res.send(body)
  } catch (e) {
    return res.status(502).json({ error: 'Subtitle fetch failed' })
  }
}
