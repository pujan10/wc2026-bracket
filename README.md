# 🏆 World Cup 2026 — Bracket Predictor

An interactive **fill-out-your-own-bracket** game for the 2026 FIFA World Cup.
You predict how every group finishes, choose which third-placed teams sneak
through, then click your way through the entire knockout stage — Round of 32 to
the Final — and crown your champion. The bracket builds (and rebuilds) itself as
you pick.

No build step, no dependencies. **Just open `index.html` in any modern browser.**

---

## ▶️ How to play

1. **Open `index.html`** (double-click it, or serve the folder — see below).
2. **Group Stage** — drag teams (or use the ▲▼ arrows) to set each group's final
   1st → 4th. The top two of every group qualify automatically.
3. **Best thirds** — 8 of the 12 third-placed teams advance. Pick the 8 you think
   make it. (Stuck? Hit **Auto** to take the 8 strongest.)
4. **Knockouts** — your Round of 32 is generated from your group predictions using
   the *official* 2026 bracket wiring. Click the team you think wins each tie;
   winners flow into the next round. Change an earlier pick and everything
   downstream re-opens.
5. **Crown a champion** — win the Final and the confetti flies. Your full
   prediction, podium and the champion's "Road to Glory" appear on the
   **Your Champion** tab.

Your bracket **saves automatically** in the browser, so you can close the tab and
come back. Use **Share** to copy a link that encodes your entire bracket, or
**Export** to download it as an image.

---

## ✨ Features

- **Self-building bracket** — group predictions + your 8 third-place picks
  populate the Round of 32 automatically, following FIFA's real 2026 wiring
  (matches 73–88) and the constraint-based allocation of best third-placed teams.
- **Smart cascade** — picking a winner advances them; changing an upstream result
  cleanly invalidates only the picks that depended on it.
- **Mirrored bracket layout** — a proper left-meets-right tournament tree with
  connector elbows, horizontally scrollable, that holds its shape at any size.
- **Drag-and-drop _and_ arrow** group ranking (whichever you prefer).
- **Helpers** — "★ Favourites" (rank/advance by seeding), "⚄ Surprise me"
  (plausible randomised picks), and reset buttons. They're just shortcuts — every
  result is yours to override.
- **Shareable links** — your whole bracket compresses into a ~23-character code in
  the URL.
- **Image export, autosave, live progress bar, confetti, fully responsive.**

---

## 🌍 The 2026 format (modelled accurately)

- **48 teams**, 12 groups of four (A–L).
- Top 2 of each group **+ the 8 best third-placed teams** = **32** into the
  knockouts.
- **Round of 32 → Round of 16 → Quarter-finals → Semi-finals → Final.**
- Group composition reflects the 5 Dec 2025 draw with all six playoff slots
  resolved (Mar 2026): UEFA winners **Czechia → A, Bosnia → B, Türkiye → D,
  Sweden → F**; intercontinental winners **Iraq → I, DR Congo → K**.

> The eight "best third" Round-of-32 slots each accept thirds from a fixed set of
> groups. The app solves the assignment with most-constrained-first backtracking,
> so **any** combination of 8 qualifying groups produces a legal bracket
> (verified across all 495 combinations — see tests).

---

## 🗂️ Project structure

```
index.html      markup & layout
styles.css      premium dark theme, responsive, the bracket connectors
data.js         the 48 teams, 12 groups, official R32/R16/QF/SF/Final wiring
bracket.js      pure logic: third-place allocation, resolve cascade, pruning
app.js          UI, drag/drop, state, autosave, share-links, export, confetti
tests/          Node test harnesses (see below)
```

The game is **100% static** — `data.js`, `bracket.js` and `app.js` are plain
`<script>`s. The only network calls are to `flagcdn.com` for flag images and
Google Fonts; everything else works offline.

---

## 🧪 Tests

The prediction/bracket logic has full coverage:

```bash
npm test          # logic + share-link round-trip (no dependencies)
```

- **test_logic.js** — structure checks, **all 495** third-place combinations are
  placeable with zero constraint violations, the resolve cascade fills 32 → 1, and
  pruning never leaves a dangling pick.
- **test_share.js** — 300 random brackets encode → decode without drift.

An optional end-to-end DOM test drives the real UI in a headless DOM:

```bash
npm install       # installs jsdom (dev only)
npm run test:dom  # renders index.html, ranks groups, builds the bracket, crowns a champ
```

---

## 📦 Running it as a server (optional)

Opening the file directly works. If you prefer a local server:

```bash
npx serve .
# or
python -m http.server
```

---

## ⚠️ Disclaimer

Unofficial fan project for fun. Team strength values are coarse estimates used
only to power the optional "Favourites / Surprise me" helpers and seeding hints —
**you** make every prediction. Flags via [flagcdn.com](https://flagcdn.com).
