import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 4173);
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_MARKETS = ['US', 'KR', 'JP', 'GB', 'CA'];
const MAX_PAGES_PER_MARKET = 5;
const PAGE_SIZE = 50;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

let spotifyTokenCache = { token: null, expiresAt: 0 };

async function getSpotifyAccessToken() {
  const now = Date.now();
  if (spotifyTokenCache.token && now < spotifyTokenCache.expiresAt - 30_000) {
    return spotifyTokenCache.token;
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify credentials are not configured on the server.');
  }

  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    throw new Error('Failed to authenticate with Spotify.');
  }

  const data = await response.json();
  spotifyTokenCache = {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 3600) * 1000
  };
  return spotifyTokenCache.token;
}

function normalizeWord(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

async function searchSpotifyTracks(word) {
  const token = await getSpotifyAccessToken();
  const normalized = normalizeWord(word);
  const seen = new Set();
  const tracks = [];

  for (const market of SPOTIFY_MARKETS) {
    for (let page = 0; page < MAX_PAGES_PER_MARKET; page += 1) {
      const offset = page * PAGE_SIZE;
      const params = new URLSearchParams({
        q: normalized,
        type: 'track',
        market,
        limit: String(PAGE_SIZE),
        offset: String(offset)
      });

      const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch Spotify tracks.');
      }

      const data = await response.json();
      const items = data?.tracks?.items || [];
      for (const item of items) {
        const title = item?.name || '';
        const artist = item?.artists?.[0]?.name || 'Unknown Artist';
        const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
        if (!title || !artist || seen.has(key)) continue;
        seen.add(key);

        tracks.push({
          title,
          artist,
          popularity: Number(item?.popularity || 0),
          durationMs: Number(item?.duration_ms || 0),
          genre: ''
        });
      }

      if (items.length < PAGE_SIZE) break;
    }
  }

  return tracks;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function serveStaticFile(reqPath, res) {
  const cleanPath = reqPath === '/' ? '/index.html' : reqPath;
  const filePath = path.join(__dirname, cleanPath);
  const ext = path.extname(filePath);
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/spotify-search') {
    const word = normalizeWord(requestUrl.searchParams.get('word'));
    if (!word) {
      sendJson(res, 400, { error: 'Missing word parameter.' });
      return;
    }

    try {
      const tracks = await searchSpotifyTracks(word);
      sendJson(res, 200, { tracks });
      return;
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : 'Spotify request failed.' });
      return;
    }
  }

  await serveStaticFile(requestUrl.pathname, res);
});

server.listen(PORT, () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
});
