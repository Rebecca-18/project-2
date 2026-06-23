import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WordHistory,
  getEmojiForWord,
  getMoodPalette,
  getThemeForWord,
  normalizeWord,
  rankSongsForOutput
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

test('rankSongsForOutput keeps ascending popularity and index starts at 1', () => {
  const songs = [
    { title: 'A', rank: 90, artist: { name: 'X' } },
    { title: 'B', rank: 10, artist: { name: 'Y' } },
    { title: 'C', rank: 70, artist: { name: 'Z' } }
  ];
  const ranked = rankSongsForOutput(songs);

  assert.deepEqual(
    ranked.map((item) => item.title),
    ['B', 'C', 'A']
  );
  assert.deepEqual(
    ranked.map((item) => item.popularityIndex),
    [1, 2, 3]
  );
});

test('emoji, mood, and theme mappings are available for aesthetic rules', () => {
  assert.equal(getEmojiForWord('sun'), '☀️');
  assert.ok(Array.isArray(getMoodPalette('happy')));
  assert.equal(getThemeForWord('forest')?.startsWith('linear-gradient'), true);
});
