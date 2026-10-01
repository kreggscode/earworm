# Earworm

**Turn your notes into a 30-second song, then get quizzed on the words you just heard.**

Paste what you have to remember. A text model writes the lyrics, the audio model
sings them in a style you pick, and quiz mode blanks the key terms straight out
of the lines so you have to supply them yourself.

<https://kreggscode.github.io/earworm/>

## The loop

```
notes
  │
  ▼
text model  ──►  lyrics + the terms worth keeping   openai/gpt-5.4-nano
  │
  ▼
audio model ──►  one 30-second MP3, sung            google/lyria-3-clip-preview
  │
  ▼
quiz mode   ──►  the terms blanked out of the lines, graded as you fill them in
```

One song costs one text call and one audio call — about twenty seconds end to
end. Changing the style re-sings the *same* words, so the material never moves
under you; only the arrangement does.

### What comes back

`POST /v1/audio/speech` with `model=google/lyria-3-clip-preview` takes the lyrics
in the prompt and returns a fixed 30-second MP3. It is not background music with
vocals on top — transcribe it afterwards and the words come back verbatim, which
is the only reason a study song works at all. The live test does exactly that.

## Controls

- **Style** — Bubblegum pop, 80s synthpop, Acoustic folk, Hip hop, Sea shanty,
  Lullaby. Pick one before you write, or tap another afterwards to hear the same
  lyrics arranged differently.
- **Quiz me** — key terms are blanked where they actually appear in the lyrics,
  one per line, and graded case- and punctuation-insensitively.
- **Add to playlist** — songs are kept in `localStorage` as lyrics and style, so
  a saved entry can be re-sung on demand without holding megabytes of audio.

## Run it

```bash
npm install
npm run dev
```

Bring your own Pollen — the app signs in through Pollinations and spends the
player's own balance, never the developer's:

```bash
echo "VITE_POLLINATIONS_CLIENT_ID=pk_yourkey" > .env.local
```

The `pk_...` key is publishable by design: it only names the app on the consent
screen and attributes traffic. The scoped `sk_...` returned after consent is the
value that must stay in memory.

## Checks

```bash
npm run lint   # tsc --noEmit
npm test       # 37 tests — 32 pure, 5 live against the real endpoints
npm run build
```

The pure tests spend nothing: how a reply is pulled out of a fenced block, what
makes a song valid (including refusing a term the lyrics never say), how the
longest matching term is the one that gets blanked, how answers are graded, and
how the playlist behaves when storage is full or corrupt.

The live tests run the real chain — write lyrics from notes, sing them, then
transcribe the result and assert that at least two of the study terms came back
out of the audio.

```bash
# end-to-end, against the deployed app
POLLINATIONS_API_KEY=sk_... E2E_BASE_URL=https://kreggscode.github.io/earworm/ npx playwright test
```

Screenshots land in `evidence/`.

## Why this and not a flashcard

A flashcard asks you to recall a fact in isolation. A song gives the fact a
neighbour on both sides, which is what makes it retrievable — and the quiz mode
keeps it honest by taking the term back out of the line you just sang. The model
writes and sings; everything about *what counts as correct* stays in code.

See [BRING_YOUR_OWN_POLLEN.md](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
for the consent flow.
