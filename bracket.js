/* =============================================================================
 * bracket.js — pure prediction/bracket logic (no DOM)
 * -----------------------------------------------------------------------------
 * Operates on a plain `state` object owned by app.js:
 *   state.order  = { A:[id,id,id,id], ... }  player's predicted 1st→4th finish
 *   state.thirds = [groupLetter, ...]         groups whose 3rd-placed team advances (target: 8)
 *   state.picks  = { matchNumber: teamId }    knockout winners the player chose
 *
 * The centrepiece is compute(state): it resolves every match's two teams, the
 * third-place allocation, and a *pruned* set of valid picks (so changing an
 * early pick cleanly invalidates everything downstream that depended on it).
 * ========================================================================== */

/* The eight Round-of-32 slots reserved for best-third-placed teams, each with
 * the set of groups whose third-placed side may legally fill it. */
const THIRD_SLOTS = R32
  .map((x) => {
    const slot = x.home.type === "third" ? x.home : x.away.type === "third" ? x.away : null;
    return slot ? { m: x.m, allowed: slot.allowed } : null;
  })
  .filter(Boolean);

/* ---- Default / fresh state ------------------------------------------------ */
function makeDefaultState() {
  const order = {};
  for (const g of GROUP_LETTERS) order[g] = GROUPS[g].map((t) => t.id);
  return { order, thirds: [], picks: {} };
}

/* ---- Third-place allocation ----------------------------------------------
 * Given exactly 8 group letters (the groups whose 3rd-placed teams advance),
 * assign each to a distinct third-slot whose constraint permits it. Uses
 * most-constrained-first backtracking with deterministic tie-breaks, so a given
 * set of qualifiers always yields the same legal bracket. Returns { m: letter }
 * or null if the eight cannot be legally placed.
 * ------------------------------------------------------------------------- */
function allocateThirds(groups) {
  // Sort so allocation depends only on WHICH groups qualified, not the order
  // they were selected — keeps the bracket stable and share-links reproducible.
  const unique = [...new Set(groups)].sort();
  if (unique.length !== 8) return null;

  const used = {};
  const result = {};

  const candidatesFor = (letter) =>
    THIRD_SLOTS.filter((s) => !used[s.m] && s.allowed.includes(letter)).map((s) => s.m);

  function solve(remaining) {
    if (remaining.length === 0) return true;
    // choose the still-unplaced group with the fewest legal slots
    let pick = null, pickCands = null;
    for (const letter of remaining) {
      const cands = candidatesFor(letter);
      if (cands.length === 0) return false;
      if (pickCands === null || cands.length < pickCands.length) {
        pick = letter;
        pickCands = cands;
      }
    }
    for (const m of pickCands) {
      used[m] = true;
      result[m] = pick;
      if (solve(remaining.filter((l) => l !== pick))) return true;
      used[m] = false;
      delete result[m];
    }
    return false;
  }

  return solve(unique) ? { ...result } : null;
}

/* ---- Core resolver -------------------------------------------------------
 * Returns:
 *   alloc      { m: groupLetter }                third-slot allocation (or null)
 *   teams      { m: { home, away } }             resolved team ids per match (null = TBD)
 *   winners    { m: teamId }                     valid chosen winners only
 *   cleanPicks { m: teamId }                     picks after pruning invalid ones
 * ------------------------------------------------------------------------- */
function compute(state) {
  const order = state.order || {};
  const thirds = state.thirds || [];
  const picks = state.picks || {};

  const alloc = thirds.length === 8 ? allocateThirds(thirds) : null;
  const teams = {};
  const winners = {};
  const cleanPicks = {};

  const slotTeam = (slot, m) => {
    if (!slot) return null;
    if (slot.type === "winner") return order[slot.group]?.[0] ?? null;
    if (slot.type === "runner") return order[slot.group]?.[1] ?? null;
    if (slot.type === "third") {
      if (!alloc) return null;
      const grp = alloc[m];
      return grp ? (order[grp]?.[2] ?? null) : null;
    }
    return null;
  };

  // Round of 32: teams come directly from group results + third allocation.
  for (const x of R32) {
    teams[x.m] = { home: slotTeam(x.home, x.m), away: slotTeam(x.away, x.m) };
  }

  // Resolve a round: fill KO teams from feeder winners, then validate the pick.
  const resolveRound = (list) => {
    for (const x of list) {
      if (x.from) {
        teams[x.m] = { home: winners[x.from[0]] ?? null, away: winners[x.from[1]] ?? null };
      }
      const t = teams[x.m] || { home: null, away: null };
      const pick = picks[x.m] ?? null;
      if (pick && (pick === t.home || pick === t.away)) {
        winners[x.m] = pick;
        cleanPicks[x.m] = pick;
      } else {
        winners[x.m] = null;
      }
    }
  };

  resolveRound(R32);
  resolveRound(KO_TREE.R16);
  resolveRound(KO_TREE.QF);
  resolveRound(KO_TREE.SF);
  resolveRound(KO_TREE.F);

  return { alloc, teams, winners, cleanPicks };
}

/* ---- Small read helpers used by the UI ----------------------------------- */

function teamAt(state, group, pos) {
  return state.order?.[group]?.[pos] ?? null;
}

/* The 12 third-placed teams given current group orders. */
function thirdPlacedTeams(state) {
  return GROUP_LETTERS.map((g) => ({ group: g, id: teamAt(state, g, 2) }));
}

/* Human label for an unresolved slot (shown before its team is known). */
function slotLabel(slot) {
  if (!slot) return "TBD";
  if (slot.type === "winner") return "Winner " + slot.group;
  if (slot.type === "runner") return "Runner-up " + slot.group;
  if (slot.type === "third") return "3rd: " + slot.allowed.join("/");
  return "TBD";
}

/* Short label like "1A", "2B", "3?" for compact bracket chips. */
function slotShort(slot) {
  if (!slot) return "—";
  if (slot.type === "winner") return "1" + slot.group;
  if (slot.type === "runner") return "2" + slot.group;
  if (slot.type === "third") return "3rd";
  return "—";
}

/* Completion stats for the progress bar. */
function progress(state) {
  const c = compute(state);
  const thirdsDone = (state.thirds || []).length === 8;
  const koTotal = 16 + 8 + 4 + 2 + 1; // 31 knockout matches
  const koDone = Object.keys(c.winners).filter((m) => c.winners[m]).length;
  const champion = c.winners[FINAL_MATCH] || null;
  return {
    thirdsDone,
    koDone,
    koTotal,
    champion,
    // group stage counts as "done" once 8 thirds are chosen; weight halves.
    pct: Math.round(((thirdsDone ? 0.5 : (state.thirds.length / 8) * 0.5) +
                     (koDone / koTotal) * 0.5) * 100),
  };
}
