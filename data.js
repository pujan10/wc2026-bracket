/* =============================================================================
 * data.js — FIFA World Cup 2026 static data
 * -----------------------------------------------------------------------------
 * Source of truth for: the 48 qualified teams, the 12 official groups (A–L),
 * the official Round-of-32 wiring (matches 73–88) with third-place slot
 * constraints, and the knockout tree through R16 / QF / SF / Final.
 *
 * Group composition reflects the 5 Dec 2025 draw with all six playoff slots
 * resolved (Mar 2026): UEFA winners Czechia→A, Bosnia→B, Türkiye→D, Sweden→F;
 * intercontinental winners Iraq→I, DR Congo→K.
 *
 * `rank` is a coarse 0–100 strength estimate. It is NOT used to decide any
 * outcome — the player makes every pick. It only powers optional helper
 * buttons ("Favourites", "Surprise me") and a subtle seeding hint.
 * Flags load from flagcdn.com using each team's ISO code.
 * ========================================================================== */

const HOSTS = ["us", "ca", "mx"];

/* ---- Teams, grouped A–L, listed in draw (seeding) order ------------------ */
const GROUPS = {
  A: [
    { id: "mx", name: "Mexico",        code: "mx",     rank: 77, conf: "CONCACAF" },
    { id: "za", name: "South Africa",  code: "za",     rank: 68, conf: "CAF" },
    { id: "kr", name: "Korea Republic",code: "kr",     rank: 76, conf: "AFC" },
    { id: "cz", name: "Czechia",       code: "cz",     rank: 75, conf: "UEFA" },
  ],
  B: [
    { id: "ca", name: "Canada",        code: "ca",     rank: 75, conf: "CONCACAF" },
    { id: "ba", name: "Bosnia & H.",   code: "ba",     rank: 72, conf: "UEFA" },
    { id: "qa", name: "Qatar",         code: "qa",     rank: 68, conf: "AFC" },
    { id: "ch", name: "Switzerland",   code: "ch",     rank: 80, conf: "UEFA" },
  ],
  C: [
    { id: "br", name: "Brazil",        code: "br",     rank: 92, conf: "CONMEBOL" },
    { id: "ma", name: "Morocco",       code: "ma",     rank: 84, conf: "CAF" },
    { id: "ht", name: "Haiti",         code: "ht",     rank: 62, conf: "CONCACAF" },
    { id: "sct",name: "Scotland",      code: "gb-sct", rank: 74, conf: "UEFA" },
  ],
  D: [
    { id: "us", name: "USA",           code: "us",     rank: 78, conf: "CONCACAF" },
    { id: "py", name: "Paraguay",      code: "py",     rank: 72, conf: "CONMEBOL" },
    { id: "au", name: "Australia",     code: "au",     rank: 73, conf: "AFC" },
    { id: "tr", name: "Türkiye",       code: "tr",     rank: 78, conf: "UEFA" },
  ],
  E: [
    { id: "de", name: "Germany",       code: "de",     rank: 88, conf: "UEFA" },
    { id: "cw", name: "Curaçao",       code: "cw",     rank: 60, conf: "CONCACAF" },
    { id: "ci", name: "Côte d'Ivoire", code: "ci",     rank: 74, conf: "CAF" },
    { id: "ec", name: "Ecuador",       code: "ec",     rank: 77, conf: "CONMEBOL" },
  ],
  F: [
    { id: "nl", name: "Netherlands",   code: "nl",     rank: 89, conf: "UEFA" },
    { id: "jp", name: "Japan",         code: "jp",     rank: 80, conf: "AFC" },
    { id: "se", name: "Sweden",        code: "se",     rank: 76, conf: "UEFA" },
    { id: "tn", name: "Tunisia",       code: "tn",     rank: 70, conf: "CAF" },
  ],
  G: [
    { id: "be", name: "Belgium",       code: "be",     rank: 86, conf: "UEFA" },
    { id: "eg", name: "Egypt",         code: "eg",     rank: 74, conf: "CAF" },
    { id: "ir", name: "Iran",          code: "ir",     rank: 73, conf: "AFC" },
    { id: "nz", name: "New Zealand",   code: "nz",     rank: 64, conf: "OFC" },
  ],
  H: [
    { id: "es", name: "Spain",         code: "es",     rank: 95, conf: "UEFA" },
    { id: "cv", name: "Cabo Verde",    code: "cv",     rank: 64, conf: "CAF" },
    { id: "sa", name: "Saudi Arabia",  code: "sa",     rank: 67, conf: "AFC" },
    { id: "uy", name: "Uruguay",       code: "uy",     rank: 83, conf: "CONMEBOL" },
  ],
  I: [
    { id: "fr", name: "France",        code: "fr",     rank: 95, conf: "UEFA" },
    { id: "sn", name: "Senegal",       code: "sn",     rank: 80, conf: "CAF" },
    { id: "iq", name: "Iraq",          code: "iq",     rank: 66, conf: "AFC" },
    { id: "no", name: "Norway",        code: "no",     rank: 79, conf: "UEFA" },
  ],
  J: [
    { id: "ar", name: "Argentina",     code: "ar",     rank: 96, conf: "CONMEBOL" },
    { id: "dz", name: "Algeria",       code: "dz",     rank: 74, conf: "CAF" },
    { id: "at", name: "Austria",       code: "at",     rank: 78, conf: "UEFA" },
    { id: "jo", name: "Jordan",        code: "jo",     rank: 66, conf: "AFC" },
  ],
  K: [
    { id: "pt", name: "Portugal",      code: "pt",     rank: 91, conf: "UEFA" },
    { id: "cd", name: "DR Congo",      code: "cd",     rank: 70, conf: "CAF" },
    { id: "uz", name: "Uzbekistan",    code: "uz",     rank: 66, conf: "AFC" },
    { id: "co", name: "Colombia",      code: "co",     rank: 82, conf: "CONMEBOL" },
  ],
  L: [
    { id: "eng",name: "England",       code: "gb-eng", rank: 92, conf: "UEFA" },
    { id: "hr", name: "Croatia",       code: "hr",     rank: 83, conf: "UEFA" },
    { id: "gh", name: "Ghana",         code: "gh",     rank: 73, conf: "CAF" },
    { id: "pa", name: "Panama",        code: "pa",     rank: 70, conf: "CONCACAF" },
  ],
};

const GROUP_LETTERS = Object.keys(GROUPS); // A..L

/* Flat lookup: id -> team object (with its group letter attached) */
const TEAMS = (() => {
  const map = {};
  for (const g of GROUP_LETTERS) {
    GROUPS[g].forEach((t) => { map[t.id] = { ...t, group: g }; });
  }
  return map;
})();

/* ---- Round of 32 wiring (official, matches 73–88) ------------------------
 * Each slot is one of:
 *   { type: "winner", group: "A" }
 *   { type: "runner", group: "B" }
 *   { type: "third",  allowed: ["A","B","C","D","F"] }   // best-3rd constraint
 * `side` is used purely for the mirrored bracket layout (left meets right at
 * the final). `feeds` is the R16 match this winner advances into.
 * ------------------------------------------------------------------------- */
const R32 = [
  { m: 73, side: "L", home: { type: "runner", group: "A" }, away: { type: "runner", group: "B" } },
  { m: 74, side: "L", home: { type: "winner", group: "E" }, away: { type: "third", allowed: ["A","B","C","D","F"] } },
  { m: 75, side: "L", home: { type: "winner", group: "F" }, away: { type: "runner", group: "C" } },
  { m: 76, side: "R", home: { type: "winner", group: "C" }, away: { type: "runner", group: "F" } },
  { m: 77, side: "L", home: { type: "winner", group: "I" }, away: { type: "third", allowed: ["C","D","F","G","H"] } },
  { m: 78, side: "R", home: { type: "runner", group: "E" }, away: { type: "runner", group: "I" } },
  { m: 79, side: "R", home: { type: "winner", group: "A" }, away: { type: "third", allowed: ["C","E","F","H","I"] } },
  { m: 80, side: "R", home: { type: "winner", group: "L" }, away: { type: "third", allowed: ["E","H","I","J","K"] } },
  { m: 81, side: "L", home: { type: "winner", group: "D" }, away: { type: "third", allowed: ["B","E","F","I","J"] } },
  { m: 82, side: "L", home: { type: "winner", group: "G" }, away: { type: "third", allowed: ["A","E","H","I","J"] } },
  { m: 83, side: "L", home: { type: "runner", group: "K" }, away: { type: "runner", group: "L" } },
  { m: 84, side: "L", home: { type: "winner", group: "H" }, away: { type: "runner", group: "J" } },
  { m: 85, side: "R", home: { type: "winner", group: "B" }, away: { type: "third", allowed: ["E","F","G","I","J"] } },
  { m: 86, side: "R", home: { type: "winner", group: "J" }, away: { type: "runner", group: "H" } },
  { m: 87, side: "R", home: { type: "winner", group: "K" }, away: { type: "third", allowed: ["D","E","I","J","L"] } },
  { m: 88, side: "R", home: { type: "runner", group: "D" }, away: { type: "runner", group: "G" } },
];

/* ---- R16 / QF / SF / Final wiring (official match numbers) ---------------
 * Each later match takes the winners of two earlier matches.
 * ------------------------------------------------------------------------- */
const KO_TREE = {
  R16: [
    { m: 89, side: "L", from: [74, 77] },
    { m: 90, side: "L", from: [73, 75] },
    { m: 93, side: "L", from: [83, 84] },
    { m: 94, side: "L", from: [81, 82] },
    { m: 91, side: "R", from: [76, 78] },
    { m: 92, side: "R", from: [79, 80] },
    { m: 95, side: "R", from: [86, 88] },
    { m: 96, side: "R", from: [85, 87] },
  ],
  QF: [
    { m: 97,  side: "L", from: [89, 90] },
    { m: 98,  side: "L", from: [93, 94] },
    { m: 99,  side: "R", from: [91, 92] },
    { m: 100, side: "R", from: [95, 96] },
  ],
  SF: [
    { m: 101, side: "L", from: [97, 98] },
    { m: 102, side: "R", from: [99, 100] },
  ],
  F: [
    { m: 104, side: "C", from: [101, 102] },
  ],
};

/* Left/right column ordering for the mirrored bracket layout (top → bottom) */
const BRACKET_LAYOUT = {
  L: {
    R32: [74, 77, 73, 75, 83, 84, 81, 82],
    R16: [89, 90, 93, 94],
    QF:  [97, 98],
    SF:  [101],
  },
  R: {
    R32: [76, 78, 79, 80, 86, 88, 85, 87],
    R16: [91, 92, 95, 96],
    QF:  [99, 100],
    SF:  [102],
  },
};

/* Convenience: every match keyed by number, with round + wiring */
const MATCHES = (() => {
  const map = {};
  R32.forEach((x) => (map[x.m] = { ...x, round: "R32" }));
  for (const round of ["R16", "QF", "SF", "F"]) {
    KO_TREE[round].forEach((x) => (map[x.m] = { ...x, round }));
  }
  return map;
})();

const FINAL_MATCH = 104;
