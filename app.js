const WORD_API = 'https://api.datamuse.com/words';
const SONG_API = 'https://api.lyrics.ovh/suggest/';
const MAX_SONGS = 300;
const RECENT_WORD_LIMIT = 200;
const MAX_SONG_API_INDEX = 1000;

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
  autumn: 'linear-gradient(120deg, #bc6c25, #dda15e, #6f1d1b)'
};

function normalizeWord(value) {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function chooseRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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
  return themedBackgrounds[word] || null;
}

function rankSongsForOutput(songs) {
  // Deezer rank values are higher for more popular tracks.
  const ascendingByRank = [...songs].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const top = ascendingByRank.slice(-MAX_SONGS);
  return top.map((song, i) => ({
    popularityIndex: i + 1,
    title: song.title,
    artist: song.artist?.name || 'Unknown Artist',
    rank: song.rank ?? 0
  }));
}

function toEmojiBackgroundDataUri(emoji) {
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Ctext y='0.9em' font-size='120'%3E${encodeURIComponent(emoji)}%3C/text%3E%3C/svg%3E")`;
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
  const response = await fetch(`${WORD_API}?${params.toString()}`);
  if (!response.ok) throw new Error('Word API failed');
  const items = await response.json();
  return items.map((item) => normalizeWord(item.word)).filter(Boolean);
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
  const allMatches = [];
  const pageSize = 100;
  for (
    let index = 0;
    index < MAX_SONG_API_INDEX && allMatches.length < MAX_SONGS * 3;
    index += pageSize
  ) {
    const response = await fetch(
      `${SONG_API}${encodeURIComponent(word)}?index=${index}&limit=${pageSize}`
    );
    if (!response.ok) throw new Error('Song API failed');
    const data = await response.json();
    const batch = (data.data || []).filter((song) =>
      song.title?.toLowerCase().includes(word.toLowerCase())
    );
    allMatches.push(...batch);
    if (!data.next || batch.length === 0) break;
  }
  return allMatches;
}

async function findWordWithSongs(history, maxWordAttempts = 10) {
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

function renderSongs(listEl, songs) {
  listEl.innerHTML = '';
  songs.forEach((song) => {
    const li = document.createElement('li');
    li.textContent = `${song.popularityIndex}. ${song.title} — ${song.artist}`;
    listEl.appendChild(li);
  });
}

function setupApp(doc = document) {
  const history = new WordHistory();
  const button = doc.getElementById('generateBtn');
  const status = doc.getElementById('status');
  const word = doc.getElementById('word');
  const songList = doc.getElementById('songList');

  async function run() {
    button.disabled = true;
    status.textContent = 'Generating word and finding songs...';
    try {
      const result = await findWordWithSongs(history);
      word.textContent = result.word;
      renderSongs(songList, result.songs);
      applyBackgroundForWord(result.word);
      status.textContent = `Found ${result.songs.length} songs for “${result.word}”.`;
    } catch (error) {
      status.textContent = error.message || 'Something went wrong.';
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener('click', run);
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
  rankSongsForOutput
};
