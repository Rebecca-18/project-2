# project-2

Simple static site that:
- generates a random English dictionary word,
- finds the top 300 most popular songs with that word in the title (or fewer if unavailable),
- lists those selected songs from least popular (1) to most popular.

## Run
1. Create Spotify API credentials at https://developer.spotify.com/dashboard.
2. Start the app with Spotify credentials:

```bash
SPOTIFY_CLIENT_ID=your_client_id SPOTIFY_CLIENT_SECRET=your_client_secret npm start
```

3. Open `http://127.0.0.1:4173` in your browser.

If Spotify credentials are not set, the app automatically falls back to iTunes search.

## Test
```bash
npm test
```
