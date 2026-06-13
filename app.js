/* =============================================================================
 * app.js — UI, state, persistence and interactions
 * Depends on globals from data.js and bracket.js.
 * ========================================================================== */
(function () {
  "use strict";

  const STORAGE_KEY = "wc2026-bracket-v1";
  const FLAG = (code) => `https://flagcdn.com/${code}.svg`;

  /* ---------------------------------------------------- tiny DOM helpers --- */
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const flagEl = (code, cls) => {
    const img = el("img", cls || "flag");
    img.loading = "lazy";
    img.alt = "";
    img.src = FLAG(code);
    img.addEventListener("error", () => { img.style.visibility = "hidden"; });
    return img;
  };

  /* ---------------------------------------------------- state -------------- */
  let state = loadState();
  let lastChampion = null;     // for confetti trigger
  let stage = "groups";

  function loadState() {
    // 1) shared link wins, 2) localStorage, 3) fresh
    try {
      if (location.hash.startsWith("#b=")) {
        const s = decodeState(location.hash.slice(3));
        if (s) return s;
      }
    } catch (_) {}
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.order) return normalize(s);
      }
    } catch (_) {}
    return makeDefaultState();
  }

  /* Guard against malformed/partial saved state. */
  function normalize(s) {
    const def = makeDefaultState();
    const out = { order: {}, thirds: [], picks: {} };
    for (const g of GROUP_LETTERS) {
      const arr = Array.isArray(s.order?.[g]) ? s.order[g] : [];
      const valid = arr.filter((id) => TEAMS[id] && TEAMS[id].group === g);
      // append any missing teams to keep all four present
      for (const id of def.order[g]) if (!valid.includes(id)) valid.push(id);
      out.order[g] = valid.slice(0, 4);
    }
    out.thirds = (Array.isArray(s.thirds) ? s.thirds : []).filter((g) => GROUP_LETTERS.includes(g)).slice(0, 8);
    out.picks = (s.picks && typeof s.picks === "object") ? s.picks : {};
    out.picks = compute(out).cleanPicks;
    return out;
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  /* Re-validate picks after any change, persist, then repaint. */
  function commit() {
    state.picks = compute(state).cleanPicks;
    save();
    renderAll();
  }

  /* ---------------------------------------------------- share encoding -----
   * Compact: 12 group permutations (5 bits) + 12-bit thirds mask +
   * 31 knockout picks (2 bits: 0 none / 1 home / 2 away). ~23 chars.
   * ----------------------------------------------------------------------- */
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const KO_ORDER = [
    ...R32.map((x) => x.m),
    ...KO_TREE.R16.map((x) => x.m),
    ...KO_TREE.QF.map((x) => x.m),
    ...KO_TREE.SF.map((x) => x.m),
    ...KO_TREE.F.map((x) => x.m),
  ];
  const FACT = [1, 1, 2, 6];

  function permToIndex(perm) {
    const items = [0, 1, 2, 3]; let idx = 0;
    for (let i = 0; i < 4; i++) {
      const pos = items.indexOf(perm[i]);
      idx += pos * FACT[3 - i];
      items.splice(pos, 1);
    }
    return idx;
  }
  function indexToPerm(idx) {
    const items = [0, 1, 2, 3]; const res = [];
    for (let i = 0; i < 4; i++) {
      const f = FACT[3 - i]; const pos = Math.floor(idx / f); idx %= f;
      res.push(items[pos]); items.splice(pos, 1);
    }
    return res;
  }
  function encodeState(s) {
    const bits = [];
    const push = (num, w) => { for (let j = w - 1; j >= 0; j--) bits.push((num >> j) & 1); };
    for (const g of GROUP_LETTERS) {
      const drawn = GROUPS[g].map((t) => t.id);
      const perm = s.order[g].map((id) => drawn.indexOf(id));
      push(permToIndex(perm), 5);
    }
    let mask = 0;
    GROUP_LETTERS.forEach((g, i) => { if (s.thirds.includes(g)) mask |= (1 << (11 - i)); });
    push(mask, 12);
    const c = compute(s);
    for (const m of KO_ORDER) {
      const pick = s.picks[m]; const t = c.teams[m] || {};
      let code = 0;
      if (pick && pick === t.home) code = 1; else if (pick && pick === t.away) code = 2;
      push(code, 2);
    }
    let str = "";
    for (let i = 0; i < bits.length; i += 6) {
      let v = 0; for (let j = 0; j < 6; j++) v = (v << 1) | (bits[i + j] || 0);
      str += B64[v];
    }
    return str;
  }
  function decodeState(str) {
    const bits = [];
    for (const ch of str) {
      const v = B64.indexOf(ch); if (v < 0) return null;
      for (let j = 5; j >= 0; j--) bits.push((v >> j) & 1);
    }
    let p = 0;
    const read = (w) => { let v = 0; for (let j = 0; j < w; j++) v = (v << 1) | (bits[p++] || 0); return v; };
    const order = {};
    for (const g of GROUP_LETTERS) {
      const drawn = GROUPS[g].map((t) => t.id);
      const perm = indexToPerm(read(5));
      order[g] = perm.map((i) => drawn[i]);
    }
    const mask = read(12);
    const thirds = GROUP_LETTERS.filter((g, i) => mask & (1 << (11 - i)));
    const st = { order, thirds, picks: {} };
    for (const m of KO_ORDER) {
      const code = read(2);
      if (!code) continue;
      const c = compute(st); const t = c.teams[m] || {};
      const id = code === 1 ? t.home : t.away;
      if (id) st.picks[m] = id;
    }
    return normalize(st);
  }

  /* ---------------------------------------------------- group helpers ------ */
  function moveTeam(group, id, dir) {
    const arr = state.order[group];
    const i = arr.indexOf(id), j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    commit();
  }
  function reorder(group, dragId, targetId, after) {
    const arr = state.order[group];
    const from = arr.indexOf(dragId);
    if (from < 0) return;
    arr.splice(from, 1);
    let to = arr.indexOf(targetId);
    if (after) to += 1;
    arr.splice(to, 0, dragId);
    commit();
  }
  function toggleThird(group) {
    const i = state.thirds.indexOf(group);
    if (i >= 0) state.thirds.splice(i, 1);
    else if (state.thirds.length < 8) state.thirds.push(group);
    else { toast("You've already chosen 8 — deselect one first"); return; }
    commit();
  }

  /* ---------------------------------------------------- render: groups ----- */
  function renderGroups() {
    const grid = $("#groupsGrid");
    grid.innerHTML = "";
    for (const g of GROUP_LETTERS) {
      const card = el("div", "group");
      const head = el("div", "group__head");
      head.append(el("span", "group__letter", g));
      head.append(el("span", "group__title", "Group " + g));
      head.append(el("span", "group__legend", "drag to rank"));
      card.append(head);

      state.order[g].forEach((id, pos) => {
        card.append(renderTeamRow(g, id, pos));
      });
      grid.append(card);
    }
  }

  function renderTeamRow(group, id, pos) {
    const t = TEAMS[id];
    const row = el("div", "team-row");
    row.draggable = true;
    row.dataset.group = group;
    row.dataset.id = id;
    row.dataset.pos = pos;

    row.append(el("span", "pos", String(pos + 1)));
    row.append(flagEl(t.code));
    row.append(el("span", "team-name", t.name));

    const status =
      pos < 2 ? el("span", "team-row__status st-adv", "Adv")
      : pos === 2 ? el("span", "team-row__status st-third", "3rd")
      : el("span", "team-row__status st-out", "Out");
    row.append(status);

    const arrows = el("div", "arrows");
    const up = el("button", null, "▲"); up.title = "Move up"; up.disabled = pos === 0;
    const dn = el("button", null, "▼"); dn.title = "Move down"; dn.disabled = pos === 3;
    up.addEventListener("click", (e) => { e.stopPropagation(); moveTeam(group, id, -1); });
    dn.addEventListener("click", (e) => { e.stopPropagation(); moveTeam(group, id, 1); });
    arrows.append(up, dn);
    row.append(arrows);

    attachDrag(row);
    return row;
  }

  let dragId = null, dragGroup = null;
  function attachDrag(row) {
    row.addEventListener("dragstart", (e) => {
      dragId = row.dataset.id; dragGroup = row.dataset.group;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", dragId); } catch (_) {}
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      document.querySelectorAll(".drop-before,.drop-after").forEach((n) => n.classList.remove("drop-before", "drop-after"));
      dragId = null; dragGroup = null;
    });
    row.addEventListener("dragover", (e) => {
      if (!dragId || row.dataset.group !== dragGroup || row.dataset.id === dragId) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const after = (e.clientY - r.top) > r.height / 2;
      row.classList.toggle("drop-after", after);
      row.classList.toggle("drop-before", !after);
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!dragId || row.dataset.group !== dragGroup || row.dataset.id === dragId) return;
      const after = row.classList.contains("drop-after");
      reorder(row.dataset.group, dragId, row.dataset.id, after);
    });
  }

  /* ---------------------------------------------------- render: thirds ----- */
  function renderThirds() {
    const grid = $("#thirdsGrid");
    grid.innerHTML = "";
    const thirds = thirdPlacedTeams(state);
    for (const { group, id } of thirds) {
      const t = TEAMS[id];
      const selected = state.thirds.includes(group);
      const full = state.thirds.length >= 8;
      const chip = el("div", "third-chip" + (selected ? " selected" : "") + (!selected && full ? " disabled" : ""));
      chip.append(el("span", "third-chip__grp", group));
      chip.append(flagEl(t.code, "flag flag--sm"));
      chip.append(el("span", "third-chip__name", t.name));
      chip.append(el("span", "third-chip__check", selected ? "✓" : ""));
      chip.addEventListener("click", () => toggleThird(group));
      grid.append(chip);
    }
    $("#thirdsCount").textContent = state.thirds.length;
    const ready = state.thirds.length === 8;
    $("#btnToKnockouts").disabled = !ready;
  }

  /* ---------------------------------------------------- render: bracket ---- */
  const ROUND_SHORT = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", F: "Final" };
  const ROUND_TAG = { R32: "R32", R16: "R16", QF: "QF", SF: "SF", F: "FINAL" };

  function renderBracket() {
    const ready = state.thirds.length === 8;
    $("#koEmpty").hidden = ready;
    $("#bracketWrap").hidden = !ready;
    if (!ready) return;

    const c = compute(state);
    const root = $("#bracket");
    const wrap = $("#bracketWrap");
    const keepScroll = wrap.scrollLeft; // preserve position across re-render
    root.innerHTML = "";

    function slot(m, side, teamId, winner, match) {
      const div = el("div", "match__slot");
      if (teamId) {
        const t = TEAMS[teamId];
        div.append(flagEl(t.code));
        div.append(el("span", "match__name", t.name));
        div.append(el("span", "match__seed", "(" + t.group + ")"));
        const pick = el("span", "match__pick");
        div.append(pick);
        const isWinner = winner === teamId;
        if (winner) div.classList.add(isWinner ? "winner" : "loser");
        div.classList.add("is-pickable");
        div.title = "Pick " + t.name + " to advance";
        div.addEventListener("click", () => pickWinner(m, teamId));
      } else {
        div.classList.add("tbd");
        let label;
        if (match.round === "R32") label = slotLabel(side === "home" ? match.home : match.away);
        else label = "Winner #" + match.from[side === "home" ? 0 : 1];
        div.append(el("span", "match__name", label));
      }
      return div;
    }

    function card(m) {
      const match = MATCHES[m];
      const t = c.teams[m] || { home: null, away: null };
      const winner = c.winners[m] || null;
      const cd = el("div", "match" + (match.round === "F" ? " match--final" : "") + (winner ? " complete" : ""));
      cd.append(el("div", "match__tag", `<span>${ROUND_TAG[match.round]}</span><span>#${m}</span>`));
      cd.append(slot(m, "home", t.home, winner, match));
      cd.append(slot(m, "away", t.away, winner, match));
      return cd;
    }

    function node(m, side) {
      const match = MATCHES[m];
      const n = el("div", "node node--" + side);
      const self = card(m);
      if (match.from) {
        const kids = el("div", "kids");
        kids.append(node(match.from[0], side), node(match.from[1], side));
        const conn = el("div", "connector connector--" + side);
        if (side === "L") n.append(kids, conn, self);
        else n.append(self, conn, kids);
      } else {
        n.append(self);
      }
      return n;
    }

    function finalCentre() {
      const wrap = el("div", "final-centre");
      wrap.append(el("div", "trophy", "🏆"));
      wrap.append(el("div", "final-label", "The Final"));
      wrap.append(card(FINAL_MATCH));
      const champ = c.winners[FINAL_MATCH];
      const mini = el("div", "champ-mini");
      if (champ) {
        const t = TEAMS[champ];
        mini.append(flagEl(t.code, "flag flag--lg"));
        mini.append(el("div", "name", t.name));
      } else {
        mini.append(el("div", "pending", "Your champion appears here"));
      }
      wrap.append(mini);
      return wrap;
    }

    root.append(node(101, "L"), finalCentre(), node(102, "R"));
    wrap.scrollLeft = keepScroll;
  }

  function pickWinner(m, teamId) {
    if (state.picks[m] === teamId) delete state.picks[m]; // toggle off
    else state.picks[m] = teamId;
    commit();
  }

  /* ---------------------------------------------------- render: summary ---- */
  function renderSummary() {
    const c = compute(state);
    const wrap = $("#summary");
    wrap.innerHTML = "";

    const champ = c.winners[FINAL_MATCH];
    const finalTeams = c.teams[FINAL_MATCH] || {};
    const runnerUp = champ ? (finalTeams.home === champ ? finalTeams.away : finalTeams.home) : null;

    // Champion hero
    const hero = el("div", "champ-card" + (champ ? "" : " pending"));
    if (champ) {
      const t = TEAMS[champ];
      hero.append(el("div", "eyebrow", "World Champions"));
      hero.append(flagEl(t.code));
      hero.append(el("h2", null, t.name));
      hero.append(el("div", "sub", "Your pick to lift the 2026 FIFA World Cup trophy 🏆"));
    } else {
      hero.append(el("div", "eyebrow", "No champion yet"));
      hero.append(el("h2", null, "?"));
      hero.append(el("div", "sub", "Finish your bracket to crown a winner."));
    }
    wrap.append(hero);

    // Podium (semi-final losers shown as joint semi-finalists)
    if (champ) {
      const sfLoser = (mm) => {
        const t = c.teams[mm] || {}; const w = c.winners[mm];
        return w ? (t.home === w ? t.away : t.home) : null;
      };
      const podium = el("div", "podium");
      podium.append(podiumSlot("1st", champ, "gold"));
      podium.append(podiumSlot("2nd", runnerUp, "silver"));
      const semis = [sfLoser(101), sfLoser(102)].filter(Boolean);
      const bronze = el("div", "podium__slot bronze");
      bronze.append(el("div", "rk", "SF"));
      bronze.append(el("div", "name", semis.map((id) => TEAMS[id]?.name).join(" · ") || "—"));
      podium.append(bronze);
      wrap.append(podium);
    }

    // Road to glory
    if (champ) {
      const path = el("div", "path");
      const head = el("div", "path__title", "Road to glory — " + TEAMS[champ].name);
      path.append(head);
      for (const step of championPath(c, champ)) {
        const row = el("div", "path__row");
        row.append(el("span", "path__round", ROUND_SHORT[step.round]));
        const team = el("span", "path__team");
        const opp = TEAMS[step.opp];
        if (opp) { team.append(flagEl(opp.code, "flag flag--sm")); team.append(document.createTextNode("beat " + opp.name)); }
        else team.append(document.createTextNode("—"));
        row.append(team);
        path.append(row);
      }
      wrap.append(path);
    }

    // Actions
    const actions = el("div", "summary__actions");
    const b1 = el("button", "btn btn--primary", "Share my bracket");
    const b2 = el("button", "btn btn--soft", "Download image");
    const b3 = el("button", "btn btn--soft", "Edit bracket");
    b1.addEventListener("click", share);
    b2.addEventListener("click", exportImage);
    b3.addEventListener("click", () => setStage("knockouts"));
    actions.append(b1, b2, b3);
    wrap.append(actions);
  }

  function podiumSlot(rank, id, cls) {
    const s = el("div", "podium__slot " + cls);
    s.append(el("div", "rk", rank));
    const t = id ? TEAMS[id] : null;
    s.append(el("div", "name", t ? t.name : "—"));
    if (t) s.append(flagEl(t.code));
    return s;
  }

  /* Walk the champion's wins from R32 to the final. */
  function championPath(c, champ) {
    const rounds = ["R32", "R16", "QF", "SF", "F"];
    const out = [];
    for (const r of rounds) {
      const list = r === "R32" ? R32 : KO_TREE[r];
      for (const x of list) {
        const t = c.teams[x.m] || {};
        if ((t.home === champ || t.away === champ) && c.winners[x.m] === champ) {
          out.push({ round: r, opp: t.home === champ ? t.away : t.home });
        }
      }
    }
    return out;
  }

  /* ---------------------------------------------------- progress + nav ----- */
  function renderProgress() {
    const p = progress(state);
    $("#progressBar").style.width = p.pct + "%";
    $("#progressPct").textContent = p.pct + "%";
    $("#hintGroups").textContent = `${state.thirds.length} / 8 third-place spots`;
    $("#hintKnockouts").textContent = p.thirdsDone ? `${p.koDone} / ${p.koTotal} ties picked` : "Round of 32 → Final";
    $("#hintSummary").textContent = p.champion ? TEAMS[p.champion].name : "Crown a winner";

    let label;
    if (p.champion) label = "🏆 " + TEAMS[p.champion].name + " — your champion!";
    else if (!p.thirdsDone) label = "Predict your groups & pick 8 best thirds";
    else if (p.koDone < p.koTotal) label = "Keep picking knockout winners";
    else label = "Pick your final winner";
    $("#progressLabel").textContent = label;

    // confetti when a champion is first crowned
    if (p.champion && p.champion !== lastChampion) {
      fireConfetti();
      toast("🏆 " + TEAMS[p.champion].name + " are your World Cup 2026 champions!");
    }
    lastChampion = p.champion;
  }

  function setStage(name) {
    stage = name;
    document.querySelectorAll(".stage").forEach((s) => s.classList.toggle("is-active", s.dataset.stage === name));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderAll() {
    renderGroups();
    renderThirds();
    renderBracket();
    renderSummary();
    renderProgress();
  }

  /* ---------------------------------------------------- auto-fill helpers -- */
  function fillGroupsByRank() {
    for (const g of GROUP_LETTERS) {
      state.order[g] = [...state.order[g]].sort((a, b) => TEAMS[b].rank - TEAMS[a].rank);
    }
    commit();
    toast("Groups ordered by seeding strength");
  }
  function shuffleGroups() {
    for (const g of GROUP_LETTERS) {
      const a = state.order[g];
      for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    }
    commit();
    toast("Groups shuffled — chaos reigns ⚄");
  }
  function resetGroupsOrder() {
    for (const g of GROUP_LETTERS) state.order[g] = GROUPS[g].map((t) => t.id);
    commit();
    toast("Groups reset to the official draw order");
  }
  function autoPickThirds() {
    const ranked = thirdPlacedTeams(state)
      .map((x) => ({ ...x, rank: TEAMS[x.id].rank }))
      .sort((a, b) => b.rank - a.rank);
    state.thirds = ranked.slice(0, 8).map((x) => x.group);
    commit();
    toast("Picked the 8 strongest third-placed teams");
  }

  function fillKnockouts(byRank) {
    // resolve every match in dependency order
    const rounds = [R32, KO_TREE.R16, KO_TREE.QF, KO_TREE.SF, KO_TREE.F];
    for (const list of rounds) {
      for (const x of list) {
        const c = compute(state);
        const t = c.teams[x.m] || {};
        if (!t.home || !t.away) continue;
        let winner;
        if (byRank) {
          const rh = TEAMS[t.home].rank, ra = TEAMS[t.away].rank;
          winner = rh === ra ? (Math.random() < 0.5 ? t.home : t.away) : (rh > ra ? t.home : t.away);
        } else {
          // weight slightly by strength so it's plausible, not pure coin-flip
          const rh = TEAMS[t.home].rank, ra = TEAMS[t.away].rank;
          const ph = rh / (rh + ra);
          winner = Math.random() < ph ? t.home : t.away;
        }
        state.picks[x.m] = winner;
      }
    }
    commit();
    toast(byRank ? "Favourites advanced through every round ★" : "Bracket filled with a few upsets ⚄");
  }
  function clearKnockouts() {
    state.picks = {};
    commit();
    toast("Knockout picks cleared");
  }

  /* ---------------------------------------------------- share / export ----- */
  async function share() {
    const code = encodeState(state);
    const url = location.origin + location.pathname + "#b=" + code;
    history.replaceState(null, "", "#b=" + code);
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (_) {}
    toast(ok ? "Shareable link copied to clipboard!" : "Share link in address bar (copy failed)");
  }

  function exportImage() {
    const c = compute(state);
    const champ = c.winners[FINAL_MATCH];
    const W = 1200, H = 630, dpr = 2;
    const cv = el("canvas");
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);

    // background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#070b15"); bg.addColorStop(0.5, "#0c1322"); bg.addColorStop(1, "#0a1a16");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,227,164,0.10)"; ctx.beginPath(); ctx.arc(120, 60, 280, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,203,69,0.08)"; ctx.beginPath(); ctx.arc(1080, 600, 260, 0, 7); ctx.fill();

    // header
    ctx.fillStyle = "#00e3a4"; ctx.font = "800 30px 'Barlow Condensed', sans-serif";
    ctx.fillText("FIFA WORLD CUP 2026", 60, 80);
    ctx.fillStyle = "#eef2fb"; ctx.font = "800 60px 'Barlow Condensed', sans-serif";
    ctx.fillText("MY BRACKET PREDICTION", 60, 140);

    const t = (id) => (id ? TEAMS[id].name : "—");
    const line = (label, val, y, color) => {
      ctx.fillStyle = "#93a0b8"; ctx.font = "600 22px 'Inter', sans-serif"; ctx.fillText(label, 60, y);
      ctx.fillStyle = color || "#eef2fb"; ctx.font = "800 30px 'Inter', sans-serif"; ctx.fillText(val, 360, y);
    };

    const finalTeams = c.teams[FINAL_MATCH] || {};
    const runnerUp = champ ? (finalTeams.home === champ ? finalTeams.away : finalTeams.home) : null;
    const sfLoser = (mm) => { const tt = c.teams[mm] || {}; const w = c.winners[mm]; return w ? (tt.home === w ? tt.away : tt.home) : null; };
    const qfWinners = KO_TREE.QF.map((x) => c.winners[x.m]).filter(Boolean).map(t).join(", ") || "—";

    line("🏆  Champion", t(champ), 250, "#ffcb45");
    line("Runner-up", t(runnerUp), 310);
    line("Semi-finalists", [sfLoser(101), sfLoser(102)].filter(Boolean).map(t).join(", ") || "—", 370);
    line("Final four reached", qfWinners, 430);

    // footer
    ctx.fillStyle = "#5d6a83"; ctx.font = "500 20px 'Inter', sans-serif";
    ctx.fillText("Made with the World Cup 2026 Bracket Predictor", 60, 560);
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.moveTo(60, 480); ctx.lineTo(W - 60, 480); ctx.stroke();

    try {
      const urlData = cv.toDataURL("image/png");
      const a = el("a"); a.href = urlData; a.download = "wc2026-bracket.png"; a.click();
      toast("Bracket image downloaded");
    } catch (e) {
      toast("Couldn't export image in this browser");
    }
  }

  function resetAll() {
    if (!confirm("Clear your entire bracket and start over?")) return;
    state = makeDefaultState();
    lastChampion = null;
    history.replaceState(null, "", location.pathname);
    save();
    renderAll();
    setStage("groups");
    toast("Bracket reset");
  }

  /* ---------------------------------------------------- toast + confetti --- */
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  const cvf = $("#confetti");
  const ctxf = cvf.getContext("2d");
  let pieces = [], rafId = null;
  function sizeCanvas() { cvf.width = innerWidth; cvf.height = innerHeight; }
  addEventListener("resize", sizeCanvas); sizeCanvas();
  function fireConfetti() {
    const colors = ["#00e3a4", "#18b4ff", "#ffcb45", "#ff5a6e", "#ffffff"];
    for (let i = 0; i < 160; i++) {
      pieces.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 200,
        y: innerHeight / 3,
        vx: (Math.random() - 0.5) * 12,
        vy: Math.random() * -14 - 4,
        g: 0.32 + Math.random() * 0.2,
        s: 5 + Math.random() * 7,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.4,
        c: colors[(Math.random() * colors.length) | 0],
        life: 0,
      });
    }
    if (!rafId) loopConfetti();
  }
  function loopConfetti() {
    ctxf.clearRect(0, 0, cvf.width, cvf.height);
    pieces.forEach((p) => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life++;
      ctxf.save(); ctxf.translate(p.x, p.y); ctxf.rotate(p.rot);
      ctxf.fillStyle = p.c; ctxf.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      ctxf.restore();
    });
    pieces = pieces.filter((p) => p.y < cvf.height + 40 && p.life < 320);
    if (pieces.length) rafId = requestAnimationFrame(loopConfetti);
    else { ctxf.clearRect(0, 0, cvf.width, cvf.height); rafId = null; }
  }

  /* ---------------------------------------------------- wire up ------------ */
  function init() {
    // host flags
    const hf = $("#hostFlags");
    HOSTS.forEach((code) => hf.append(flagEl(code)));

    // stage nav
    document.querySelectorAll(".stage").forEach((s) => s.addEventListener("click", () => setStage(s.dataset.stage)));
    document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => setStage(b.dataset.goto)));

    // toolbars
    $("#btnFavourites").addEventListener("click", fillGroupsByRank);
    $("#btnSurprise").addEventListener("click", shuffleGroups);
    $("#btnClearGroups").addEventListener("click", resetGroupsOrder);
    $("#btnBestThirds").addEventListener("click", autoPickThirds);
    $("#btnToKnockouts").addEventListener("click", () => setStage("knockouts"));
    $("#btnKoFavourites").addEventListener("click", () => fillKnockouts(true));
    $("#btnKoSurprise").addEventListener("click", () => fillKnockouts(false));
    $("#btnKoClear").addEventListener("click", clearKnockouts);

    // header actions
    $("#btnShare").addEventListener("click", share);
    $("#btnExport").addEventListener("click", exportImage);
    $("#btnReset").addEventListener("click", resetAll);

    renderAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
