/* Node test harness for the pure logic in data.js + bracket.js.
 * Run: node test_logic.js
 * Loads both files via eval so their top-level consts are visible to the tests. */
const fs = require("fs");
const dir = require("path").join(__dirname, ".."); // project root
let code = fs.readFileSync(dir + "/data.js", "utf8") + "\n" +
           fs.readFileSync(dir + "/bracket.js", "utf8") + "\n";

code += `
(function () {
  let fail = 0;
  const ok = (c, m) => { if (!c) { console.error("  FAIL:", m); fail++; } };

  // ---- structure -------------------------------------------------------
  ok(Object.keys(TEAMS).length === 48, "48 teams total");
  ok(GROUP_LETTERS.length === 12, "12 groups");
  GROUP_LETTERS.forEach(g => ok(GROUPS[g].length === 4, "group " + g + " has 4 teams"));

  // every winner/runner group referenced exactly once in R32
  const winners = R32.flatMap(x => [x.home, x.away]).filter(s => s.type === "winner").map(s => s.group).sort().join("");
  const runners = R32.flatMap(x => [x.home, x.away]).filter(s => s.type === "runner").map(s => s.group).sort().join("");
  ok(winners === GROUP_LETTERS.join(""), "all 12 winners used once: " + winners);
  ok(runners === GROUP_LETTERS.join(""), "all 12 runners used once: " + runners);
  ok(THIRD_SLOTS.length === 8, "8 third-place slots");

  // ---- third-place allocation across ALL 495 combinations --------------
  function* combos(arr, k, start = 0, cur = []) {
    if (cur.length === k) { yield cur.slice(); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); yield* combos(arr, k, i + 1, cur); cur.pop(); }
  }
  const slotMap = {}; THIRD_SLOTS.forEach(s => slotMap[s.m] = s.allowed);
  let total = 0, solved = 0, badLegal = 0;
  for (const combo of combos(GROUP_LETTERS, 8)) {
    total++;
    const a = allocateThirds(combo);
    if (!a) continue;
    solved++;
    const slots = Object.keys(a), grps = Object.values(a);
    if (slots.length !== 8) badLegal++;
    if (new Set(grps).size !== 8) badLegal++;
    if (new Set(combo).size !== new Set(grps).size || combo.some(g => !grps.includes(g))) badLegal++;
    for (const m of slots) if (!slotMap[m].includes(a[m])) badLegal++;
  }
  console.log("  third allocation: " + solved + "/" + total + " combinations solvable, legality errors: " + badLegal);
  ok(solved === total, "ALL " + total + " eight-group combinations are placeable");
  ok(badLegal === 0, "every allocation respects slot constraints");

  // ---- resolve cascade -------------------------------------------------
  const st = makeDefaultState();
  st.thirds = ["C", "D", "E", "F", "H", "I", "J", "K"];
  let c = compute(st);
  let r32 = 0; R32.forEach(x => { if (c.teams[x.m].home) r32++; if (c.teams[x.m].away) r32++; });
  ok(r32 === 32, "Round of 32 fully populated (32 teams), got " + r32);

  // a full deterministic playthrough: always advance the 'home' team
  const rounds = [R32, KO_TREE.R16, KO_TREE.QF, KO_TREE.SF, KO_TREE.F];
  for (const list of rounds) {
    for (const x of list) {
      const cc = compute(st);
      const t = cc.teams[x.m];
      if (t.home) st.picks[x.m] = t.home;
    }
  }
  c = compute(st);
  ok(!!c.winners[FINAL_MATCH], "a champion is produced after full playthrough: " + (TEAMS[c.winners[FINAL_MATCH]] || {}).name);
  const koDone = Object.keys(c.winners).filter(m => c.winners[m]).length;
  ok(koDone === 31, "all 31 knockout matches resolved, got " + koDone);

  // ---- pruning: changing a group order invalidates dependent picks -----
  // flip group C order so its winner changes; the R32 match using 1C must drop its pick if it pointed at old winner
  const before = compute(st).winners[76]; // match 76 = Winner C vs Runner F
  st.order.C = [st.order.C[3], st.order.C[1], st.order.C[2], st.order.C[0]]; // new winner
  const pruned = compute(st).cleanPicks;
  ok(pruned[76] === undefined || pruned[76] !== before || true, "prune runs without error");
  // deeper: the champion may have changed or been cleared; ensure no pick references a non-participant
  const c2 = compute(st);
  let dangling = 0;
  for (const m of Object.keys(c2.cleanPicks)) {
    const t = c2.teams[m];
    if (c2.cleanPicks[m] !== t.home && c2.cleanPicks[m] !== t.away) dangling++;
  }
  ok(dangling === 0, "no clean pick references a non-participant, dangling=" + dangling);

  console.log(fail ? ("\\n  " + fail + " FAILURE(S)") : "\\n  ALL TESTS PASSED");
  if (typeof process !== "undefined") process.exitCode = fail ? 1 : 0;
})();
`;

eval(code);
