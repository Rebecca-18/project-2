const WORD_API = 'https://api.datamuse.com/words';
const SONG_API = 'https://itunes.apple.com/search';
const SPOTIFY_PROXY_API = '/api/spotify-search';
const MAX_SONGS = 300;
const RECENT_WORD_LIMIT = 200;
const ITUNES_MARKETS = ['US', 'KR', 'JP', 'GB', 'CA'];
const MAX_WORD_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 4500;
const MIN_TRACK_DURATION_MS = 60_000;
const FETCH_RETRIES = 2;
const FETCH_RETRY_DELAY_MS = 120;

const moodColors = {
  happy: ['#ffe66d', '#ffbd59', '#ffd670'],
  sad: ['#8da9c4', '#5e81ac', '#4c566a'],
  calm: ['#b8f2e6', '#aed9e0', '#5eaaa8'],
  angry: ['#ff6b6b', '#c44536', '#6f1d1b'],
  love: ['#ffafcc', '#ff8fab', '#fb6f92'],
  dreamy: ['#d0bfff', '#b8c0ff', '#c3bef0'],
  excited: ['#ffd166', '#ef476f', '#f78c6b']
};

const emojiByWord = {
  sun: '☀️',
  moon: '🌙',
  rain: '🌧️',
  fire: '🔥',
  snow: '❄️',
  flower: '🌸',
  ocean: '🌊',
  heart: '❤️',
  star: '⭐',
  smile: '😊',
  party: '🎉',
  music: '🎵'
};

const themedBackgrounds = {
  forest: 'linear-gradient(120deg, #355e3b, #6b8e23, #1b4332)',
  night: 'linear-gradient(120deg, #0f172a, #1e293b, #334155)',
  beach: 'linear-gradient(120deg, #e9edc9, #94d2bd, #0a9396)',
  sky: 'linear-gradient(120deg, #caf0f8, #90e0ef, #00b4d8)',
  winter: 'linear-gradient(120deg, #edf6f9, #dfe7fd, #cddafd)',
  autumn: 'linear-gradient(120deg, #bc6c25, #dda15e, #6f1d1b)',
  artsy:
    'linear-gradient(135deg, #ff9f1c 0%, #ffbf69 22%, #2ec4b6 47%, #3a86ff 72%, #8338ec 100%)'
};

const aestheticThemeKeywords = {
  artsy: ['artiste', 'artist', 'artsy', 'art', 'gallery', 'canvas', 'paint', 'muse']
};

const colorSchemes = {
  sunrise: {
    accent: '#ff6b3d',
    buttonStart: '#ff6b3d',
    buttonEnd: '#ff9e57',
    cardTint: 'rgba(255, 244, 235, 0.82)',
    bg1: '#fff1e6',
    bg2: '#ffe0cc',
    bg3: '#ffd0b0'
  },
  ocean: {
    accent: '#0f6ea6',
    buttonStart: '#0f6ea6',
    buttonEnd: '#2aa5d6',
    cardTint: 'rgba(235, 247, 255, 0.84)',
    bg1: '#e7f6ff',
    bg2: '#c9ebff',
    bg3: '#addfff'
  },
  mint: {
    accent: '#0f8f6f',
    buttonStart: '#0f8f6f',
    buttonEnd: '#33c49f',
    cardTint: 'rgba(234, 255, 246, 0.82)',
    bg1: '#eafff5',
    bg2: '#cdfce9',
    bg3: '#b2f7dd'
  },
  dusk: {
    accent: '#6d49d8',
    buttonStart: '#6d49d8',
    buttonEnd: '#9d73ff',
    cardTint: 'rgba(243, 238, 255, 0.84)',
    bg1: '#f1ecff',
    bg2: '#ddd0ff',
    bg3: '#c8b5ff'
  }
};

function normalizeWord(value) {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function getCoreTitleForMatching(title) {
  const raw = (title || '').toLowerCase();
  return raw
    .replace(/\s*[\(\[\{]\s*(feat\.?|ft\.?|featuring)\s+[^\)\]\}]*[\)\]\}]\s*/gi, ' ')
    .replace(/\s*[-–]\s*(feat\.?|ft\.?|featuring)\s+.*$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleIncludesWordIgnoringFeatures(title, word) {
  const coreTitle = getCoreTitleForMatching(title);
  return coreTitle.includes((word || '').toLowerCase());
}

function parseDefinitionFromDatamuseEntry(entry) {
  const defs = entry?.defs;
  if (!Array.isArray(defs) || defs.length === 0) return null;
  const first = defs[0] || '';
  const tabIndex = first.indexOf('\t');
  if (tabIndex === -1) return first.trim() || null;
  return first.slice(tabIndex + 1).trim() || null;
}

function parsePronunciationFromDatamuseEntry(entry) {
  const tags = entry?.tags;
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const pronTag = tags.find((tag) => typeof tag === 'string' && tag.startsWith('pron:'));
  if (!pronTag) return null;
  const pronunciation = pronTag.slice(5).trim();
  return pronunciation || null;
}

function isLikelySongTrack(song) {
  const text = `${song.trackName || ''} ${song.artistName || ''}`.toLowerCase();
  const genre = (song.primaryGenreName || '').toLowerCase();
  const blockedPhrases = [
    'white noise',
    'brown noise',
    'pink noise',
    'rain sounds',
    'ocean sounds',
    'sleep sounds',
    'sleep music',
    'deep sleep',
    'binaural',
    'asmr',
    'meditation',
    'nature sounds'
  ];
  const blockedGenres = ['nature', 'new age', 'spoken word'];
  const hasBlockedPhrase = blockedPhrases.some((phrase) => text.includes(phrase));
  const hasBlockedGenre = blockedGenres.some((blocked) => genre.includes(blocked));
  const hasValidDuration =
    !Number.isFinite(song.trackTimeMillis) || song.trackTimeMillis >= MIN_TRACK_DURATION_MS;
  return !hasBlockedPhrase && !hasBlockedGenre && hasValidDuration;
}

function chooseRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT_MS, retries = FETCH_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Request failed');
      return await response.json();
    } catch (error) {
      if (attempt === retries) throw error;
      await wait(FETCH_RETRY_DELAY_MS * (attempt + 1));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error('Request failed');
}

function makeRandomPattern() {
  const lengths = [3, 4, 5, 6, 7, 8];
  const length = chooseRandom(lengths);
  return '?'.repeat(length);
}

function getEmojiForWord(word) {
  return emojiByWord[word] || null;
}

function getMoodPalette(word) {
  return moodColors[word] || null;
}

function getThemeForWord(word) {
  const normalized = normalizeWord(word || '');
  if (!normalized) return null;
  if (themedBackgrounds[normalized]) return themedBackgrounds[normalized];

  const matchedTheme = Object.entries(aestheticThemeKeywords).find(([, keywords]) =>
    keywords.some((keyword) => normalized.includes(keyword))
  );

  if (matchedTheme) {
    return themedBackgrounds[matchedTheme[0]] || null;
  }

  return null;
}

function getColorSchemeForWord(word) {
  const normalized = normalizeWord(word || '');
  const names = Object.keys(colorSchemes);
  if (!normalized || names.length === 0) {
    return { name: names[0] || 'default', values: colorSchemes[names[0]] || null };
  }

  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 1_000_000_007;
  }
  const name = names[hash % names.length];
  return { name, values: colorSchemes[name] };
}

function rankSongsForOutput(songs) {
  const uniqueSongs = dedupeSongsByArtistAndTitle(songs);
  // Higher rank values are treated as more popular.
  const topMostPopular = [...uniqueSongs]
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, MAX_SONGS);
  return topMostPopular.map((song, i) => ({
    popularityIndex: i + 1,
    title: song.title,
    artist: song.artist?.name || 'Unknown Artist',
    rank: song.rank ?? 0
  }));
}

function dedupeSongsByArtistAndTitle(songs) {
  const seen = new Set();
  const unique = [];

  songs.forEach((song) => {
    const title = (song.title || '').trim().toLowerCase();
    const artist = (song.artist?.name || '').trim().toLowerCase();
    const key = `${title}::${artist}`;
    if (!title || !artist || seen.has(key)) return;
    seen.add(key);
    unique.push(song);
  });

  return unique;
}

function toEmojiBackgroundDataUri(emoji) {
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Ctext x='0.1em' y='0.9em' font-size='120'%3E${encodeURIComponent(emoji)}%3C/text%3E%3C/svg%3E")`;
}

class WordHistory {
  constructor(limit = RECENT_WORD_LIMIT) {
    this.limit = limit;
    this.queue = [];
    this.set = new Set();
  }

  has(word) {
    return this.set.has(word);
  }

  add(word) {
    if (this.set.has(word)) return;
    this.queue.push(word);
    this.set.add(word);
    if (this.queue.length > this.limit) {
      const removed = this.queue.shift();
      this.set.delete(removed);
    }
  }
}

async function fetchRandomDictionaryCandidates() {
  const params = new URLSearchParams({
    sp: makeRandomPattern(),
    max: '1000',
    md: 'f'
  });
  const items = await fetchJson(`${WORD_API}?${params.toString()}`);
  return items.map((item) => normalizeWord(item.word)).filter(Boolean);
}

async function fetchWordProfile(word) {
  const params = new URLSearchParams({
    sp: word,
    max: '1',
    md: 'dr'
  });
  const items = await fetchJson(`${WORD_API}?${params.toString()}`);
  const exactMatch = (items || []).find((item) => normalizeWord(item.word) === normalizeWord(word));
  return {
    definition: parseDefinitionFromDatamuseEntry(exactMatch) || 'No definition found.',
    pronunciation: parsePronunciationFromDatamuseEntry(exactMatch) || 'Pronunciation unavailable.'
  };
}

async function pickRandomWord(history, maxAttempts = 6) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const words = await fetchRandomDictionaryCandidates();
    const uniqueCandidates = words.filter((word) => !history.has(word));
    const pool = uniqueCandidates.length ? uniqueCandidates : words;
    if (pool.length) {
      const choice = chooseRandom(pool);
      history.add(choice);
      return choice;
    }
  }
  throw new Error('Unable to generate a random dictionary word right now.');
}

async function fetchSongCandidates(word) {
  try {
    return await fetchSpotifySongCandidates(word);
  } catch {
    return await fetchItunesSongCandidates(word);
  }
}

async function fetchSpotifySongCandidates(word) {
  const params = new URLSearchParams({ word });
  const data = await fetchJson(`${SPOTIFY_PROXY_API}?${params.toString()}`, REQUEST_TIMEOUT_MS, 0);
  const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
  const filtered = tracks
    .filter((track) => titleIncludesWordIgnoringFeatures(track.title, word))
    .filter((track) =>
      isLikelySongTrack({
        trackName: track.title,
        artistName: track.artist,
        primaryGenreName: track.genre,
        trackTimeMillis: track.durationMs
      })
    )
    .map((track) => ({
      title: track.title,
      artist: { name: track.artist || 'Unknown Artist' },
      rank: Number.isFinite(track.popularity) ? track.popularity : 0
    }));
  return filtered;
}

async function fetchItunesSongCandidates(word) {
  const pageSize = 200;
  const responses = await Promise.all(
    ITUNES_MARKETS.map(async (market) => {
      const params = new URLSearchParams({
        term: word,
        entity: 'song',
        attribute: 'songTerm',
        limit: String(pageSize),
        country: market
      });
      const data = await fetchJson(`${SONG_API}?${params.toString()}`);
      return data.results || [];
    })
  );

  const allMatches = [];
  responses.forEach((results) => {
    (results || [])
      .filter((song) => isLikelySongTrack(song))
      .filter((song) => titleIncludesWordIgnoringFeatures(song.trackName, word))
      .forEach((song, i) => {
        allMatches.push({
          title: song.trackName,
          artist: { name: song.artistName || 'Unknown Artist' },
          // iTunes omits popularity score, so we use market-local relevance as a proxy.
          rank: pageSize - i
        });
      });
  });

  return allMatches;
}

async function findWordWithSongs(history, maxWordAttempts = MAX_WORD_ATTEMPTS) {
  let fallback = null;
  for (let i = 0; i < maxWordAttempts; i += 1) {
    const word = await pickRandomWord(history);
    const songs = await fetchSongCandidates(word);
    if (songs.length === 0) {
      continue;
    }
    const ranked = rankSongsForOutput(songs);
    if (ranked.length >= MAX_SONGS) {
      return { word, songs: ranked };
    }
    if (!fallback || ranked.length > fallback.songs.length) fallback = { word, songs: ranked };
  }
  if (fallback) return fallback;
  throw new Error('Could not find a word with songs after multiple attempts.');
}

function applyBackgroundForWord(word) {
  const normalized = normalizeWord(word);
  const body = document.body;
  body.classList.remove('bg-emoji', 'bg-mood', 'bg-theme', 'bg-marble-gray');

  const moodPalette = getMoodPalette(normalized);
  if (moodPalette) {
    body.classList.add('bg-mood');
    body.style.setProperty('--mood-color-1', moodPalette[0]);
    body.style.setProperty('--mood-color-2', moodPalette[1]);
    body.style.setProperty('--mood-color-3', moodPalette[2]);
    body.style.removeProperty('--emoji-bg');
    body.style.removeProperty('--theme-bg');
    return;
  }

  const emoji = getEmojiForWord(normalized);
  if (emoji) {
    body.classList.add('bg-emoji');
    body.style.setProperty('--emoji-bg', toEmojiBackgroundDataUri(emoji));
    body.style.removeProperty('--theme-bg');
    return;
  }

  const theme = getThemeForWord(normalized);
  if (theme) {
    body.classList.add('bg-theme');
    body.style.setProperty('--theme-bg', theme);
    body.style.removeProperty('--emoji-bg');
    return;
  }

  body.classList.add('bg-marble-gray');
  body.style.removeProperty('--emoji-bg');
  body.style.removeProperty('--theme-bg');
}

function applyColorSchemeForWord(word) {
  const body = document.body;
  const { name, values } = getColorSchemeForWord(word);
  body.dataset.scheme = name;
  if (!values) return name;

  body.style.setProperty('--accent-color', values.accent);
  body.style.setProperty('--button-start', values.buttonStart);
  body.style.setProperty('--button-end', values.buttonEnd);
  body.style.setProperty('--card-tint', values.cardTint);
  body.style.setProperty('--scheme-bg-1', values.bg1);
  body.style.setProperty('--scheme-bg-2', values.bg2);
  body.style.setProperty('--scheme-bg-3', values.bg3);
  return name;
}

function formatPronunciation(pronunciation) {
  if (!pronunciation || pronunciation === 'Pronunciation unavailable.') {
    return 'Pronunciation unavailable.';
  }
  const trimmed = pronunciation.trim();
  if (!trimmed) return 'Pronunciation unavailable.';
  if (trimmed.startsWith('/') && trimmed.endsWith('/')) return trimmed;
  return `/${trimmed}/`;
}

function combineDefinitionAndPronunciation(definition, pronunciation) {
  const safeDefinition = definition || 'Definition unavailable.';
  const formattedPronunciation = formatPronunciation(pronunciation);
  if (formattedPronunciation === 'Pronunciation unavailable.') return safeDefinition;
  return `${safeDefinition} Pronunciation: ${formattedPronunciation}`;
}

function createLoadingStateHandlers(doc) {
  const loadingPanel = doc.getElementById('loadingPanel');
  const loadingHint = doc.getElementById('loadingHint');
  const toggleGameBtn = doc.getElementById('toggleGameBtn');
  const tapTarget = doc.getElementById('tapTarget');
  const tapScore = doc.getElementById('tapScore');
  const resetTapScore = doc.getElementById('resetTapScore');

  let score = 0;
  let hintIntervalId = null;
  let isPinnedOpen = false;
  let isLoading = false;
  const hints = [
    'Scanning songs across markets...',
    'Scoring tracks by popularity...',
    'Styling the page for your new word...'
  ];
  let hintIndex = 0;

  if (tapTarget && tapScore) {
    tapTarget.addEventListener('click', () => {
      score += 1;
      tapScore.textContent = String(score);
    });
  }

  if (resetTapScore && tapScore) {
    resetTapScore.addEventListener('click', () => {
      score = 0;
      tapScore.textContent = '0';
    });
  }

  function setPanelVisibility() {
    if (!loadingPanel) return;
    loadingPanel.hidden = !(isPinnedOpen || isLoading);
  }

  if (toggleGameBtn) {
    toggleGameBtn.addEventListener('click', () => {
      isPinnedOpen = !isPinnedOpen;
      toggleGameBtn.textContent = isPinnedOpen ? 'Hide Tap Game' : 'Open Tap Game';
      if (loadingHint && !isLoading) {
        loadingHint.textContent = 'Tap game ready.';
      }
      setPanelVisibility();
    });
  }

  function start() {
    isLoading = true;
    setPanelVisibility();
    if (loadingHint) {
      loadingHint.textContent = hints[0];
      hintIndex = 0;
      clearInterval(hintIntervalId);
      hintIntervalId = setInterval(() => {
        hintIndex = (hintIndex + 1) % hints.length;
        loadingHint.textContent = hints[hintIndex];
      }, 1300);
    }
  }

  function stop() {
    isLoading = false;
    setPanelVisibility();
    clearInterval(hintIntervalId);
    hintIntervalId = null;
    if (loadingHint) {
      loadingHint.textContent = 'Tap game ready.';
    }
  }

  return { start, stop };
}

function renderSongs(listEl, songs) {
  listEl.innerHTML = '';
  songs.forEach((song) => {
    const li = document.createElement('li');
    li.textContent = `${song.title} — ${song.artist}`;
    listEl.appendChild(li);
  });
}

function setupApp(doc = document) {
  const history = new WordHistory();
  const button = doc.getElementById('generateBtn');
  const status = doc.getElementById('status');
  const word = doc.getElementById('word');
  const definition = doc.getElementById('definition');
  const songList = doc.getElementById('songList');
  const loadingUi = createLoadingStateHandlers(doc);

  async function run() {
    button.disabled = true;
    status.textContent = 'Generating word and finding songs...';
    loadingUi.start();
    // Keep regenerating silently until we have a usable result.
    while (true) {
      try {
        const result = await findWordWithSongs(history);
        const wordProfile = await fetchWordProfile(result.word).catch(() => ({
          definition: 'Definition unavailable.',
          pronunciation: 'Pronunciation unavailable.'
        }));
        word.textContent = result.word;
        if (definition) {
          definition.textContent = combineDefinitionAndPronunciation(
            wordProfile.definition,
            wordProfile.pronunciation
          );
        }
        renderSongs(songList, result.songs);
        applyBackgroundForWord(result.word);
        applyColorSchemeForWord(result.word);
        status.textContent = `Found ${result.songs.length} songs for “${result.word}”.`;
        break;
      } catch {
        status.textContent = 'Generating word and finding songs...';
        await wait(180);
      }
    }
    loadingUi.stop();
    button.disabled = false;
  }

  button.addEventListener('click', run);
  run();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  setupApp(document);
}

export {
  WordHistory,
  getEmojiForWord,
  getMoodPalette,
  getThemeForWord,
  normalizeWord,
  rankSongsForOutput,
  titleIncludesWordIgnoringFeatures,
  isLikelySongTrack,
  dedupeSongsByArtistAndTitle,
  parseDefinitionFromDatamuseEntry,
  parsePronunciationFromDatamuseEntry,
  getColorSchemeForWord
};
