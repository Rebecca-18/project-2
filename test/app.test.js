import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeSongsByArtistAndTitle,
  getColorSchemeForWord,
  WordHistory,
  getEmojiForWord,
  getMoodPalette,
  getThemeForWord,
  isLikelySongTrack,
  normalizeWord,
  parseDefinitionFromDatamuseEntry,
  rankSongsForOutput,
  titleIncludesWordIgnoringFeatures
} from '../app.js';

test('normalizeWord strips non-letters and lowercases', () => {
  assert.equal(normalizeWord('HeLLo! 123'), 'hello');
});

test('WordHistory limits old words to reduce repeats', () => {
  const history = new WordHistory(2);
  history.add('alpha');
  history.add('beta');
  history.add('gamma');

  assert.equal(history.has('alpha'), false);
  assert.equal(history.has('beta'), true);
  assert.equal(history.has('gamma'), true);
});

test('rankSongsForOutput keeps descending popularity and index starts at 1', () => {
  const songs = [
    { title: 'A', rank: 90, artist: { name: 'X' } },
    { title: 'B', rank: 10, artist: { name: 'Y' } },
    { title: 'C', rank: 70, artist: { name: 'Z' } }
  ];
  const ranked = rankSongsForOutput(songs);

  assert.deepEqual(
    ranked.map((item) => item.title),
    ['A', 'C', 'B']
  );
  assert.deepEqual(
    ranked.map((item) => item.popularityIndex),
    [1, 2, 3]
  );
});

test('rankSongsForOutput selects top 300 popular songs before display ordering', () => {
  const songs = Array.from({ length: 305 }, (_, i) => ({
    title: `Song ${i + 1}`,
    rank: i + 1,
    artist: { name: 'Artist' }
  }));

  const ranked = rankSongsForOutput(songs);
  assert.equal(ranked.length, 300);
  assert.equal(ranked[0].rank, 305);
  assert.equal(ranked[299].rank, 6);
});

test('dedupeSongsByArtistAndTitle removes exact artist-title repeats', () => {
  const deduped = dedupeSongsByArtistAndTitle([
    { title: 'Neon Sky', artist: { name: 'Nova' }, rank: 10 },
    { title: 'Neon Sky', artist: { name: 'Nova' }, rank: 8 },
    { title: 'Neon Sky', artist: { name: 'Other Artist' }, rank: 7 },
    { title: 'Different Song', artist: { name: 'Nova' }, rank: 6 }
  ]);

  assert.equal(deduped.length, 3);
  assert.deepEqual(
    deduped.map((song) => `${song.title}::${song.artist.name}`),
    ['Neon Sky::Nova', 'Neon Sky::Other Artist', 'Different Song::Nova']
  );
});

test('emoji, mood, and theme mappings are available for aesthetic rules', () => {
  assert.equal(getEmojiForWord('sun'), '☀️');
  assert.ok(Array.isArray(getMoodPalette('happy')));
  assert.equal(getThemeForWord('forest')?.startsWith('linear-gradient'), true);
  assert.equal(getThemeForWord('artiste')?.startsWith('linear-gradient'), true);
});

test('title matching ignores featured-artist-only mentions of the word', () => {
  assert.equal(titleIncludesWordIgnoringFeatures('Midnight Run (feat. Ajax)', 'ajax'), false);
  assert.equal(titleIncludesWordIgnoringFeatures('Summer Lights - ft Ajax', 'ajax'), false);
  assert.equal(titleIncludesWordIgnoringFeatures('Ajax Nights (feat. Someone)', 'ajax'), true);
});

test('song quality filter excludes likely noise/meditation tracks', () => {
  assert.equal(
    isLikelySongTrack({
      trackName: 'Rain Sounds for Deep Sleep',
      artistName: 'Sleep Lab',
      primaryGenreName: 'Nature',
      trackTimeMillis: 3_600_000
    }),
    false
  );

  assert.equal(
    isLikelySongTrack({
      trackName: 'Ajax Anthem',
      artistName: 'The Rockets',
      primaryGenreName: 'Pop',
      trackTimeMillis: 210_000
    }),
    true
  );
});

test('parseDefinitionFromDatamuseEntry extracts clean definition text', () => {
  assert.equal(
    parseDefinitionFromDatamuseEntry({ defs: ['n\ta person who creates art'] }),
    'a person who creates art'
  );
  assert.equal(parseDefinitionFromDatamuseEntry({ defs: [] }), null);
});

test('getColorSchemeForWord is deterministic and returns known schemes', () => {
  const one = getColorSchemeForWord('artiste');
  const two = getColorSchemeForWord('artiste');
  assert.equal(one.name, two.name);
  assert.ok(['sunrise', 'ocean', 'mint', 'dusk'].includes(one.name));
});
