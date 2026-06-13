/* DOM smoke test: load index.html in jsdom, run the real app scripts, and
 * drive the UI to confirm rendering + interactions work end-to-end.
 * Run: node test_dom.js   (requires jsdom: npm i jsdom) */
const fs = require("fs");
const { JSDOM } = require("jsdom");
const dir = require("path").join(__dirname, ".."); // project root

let fail = 0;
const ok = (c, m) => { console.log((c ? "  PASS" : "  FAIL") + ": " + m); if (!c) fail++; };

const html = fs.readFileSync(dir + "/index.html", "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

// stubs for things jsdom doesn't implement
window.HTMLCanvasElement.prototype.getContext = () => null;
window.scrollTo = () => {};
if (!window.requestAnimationFrame) window.requestAnimationFrame = () => 0;

// run the app scripts in one eval so their top-level consts share scope
// (classic <script> tags share the global lexical scope in a real browser).
const appCode = ["data.js", "bracket.js", "app.js"]
  .map((f) => fs.readFileSync(dir + "/" + f, "utf8"))
  .join("\n;\n");
window.eval(appCode);
// app defers init() to DOMContentLoaded while the document is "loading";
// fire it so init runs (in a real browser this happens automatically).
document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const click = (elm) => elm.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

// ---- initial render -------------------------------------------------------
ok($$(".group").length === 12, "12 group cards rendered");
ok($$(".team-row").length === 48, "48 team rows rendered");
ok($$(".third-chip").length === 12, "12 third-place chips rendered");
ok($("#bracketWrap").hidden === true, "bracket hidden before 8 thirds chosen");
ok($("#koEmpty").hidden === false, "knockout empty-state shown initially");

// ---- arrows reorder a group ----------------------------------------------
const firstGroup = $(".group");
const beforeName = firstGroup.querySelectorAll(".team-name")[0].textContent;
const downBtn = firstGroup.querySelectorAll(".team-row")[0].querySelector(".arrows button:last-child");
click(downBtn);
const afterName = document.querySelector(".group").querySelectorAll(".team-name")[0].textContent;
ok(beforeName !== afterName, "moving top team down changes group order (" + beforeName + " -> " + afterName + ")");

// ---- pick 8 thirds via the auto button -----------------------------------
click($("#btnBestThirds"));
ok($("#thirdsCount").textContent === "8", "auto-pick selects 8 thirds (" + $("#thirdsCount").textContent + ")");
ok($("#btnToKnockouts").disabled === false, "build-bracket button enabled at 8 thirds");

// ---- bracket should now be populated --------------------------------------
ok($("#bracketWrap").hidden === false, "bracket visible after 8 thirds");
ok($$(".match").length === 31, "31 knockout match cards rendered (" + $$(".match").length + ")");
// every R32 slot should be resolved to a real team (no TBD in round of 32)
const r32Cards = $$(".match").filter((c) => c.querySelector(".match__tag").textContent.includes("R32"));
ok(r32Cards.length === 16, "16 Round-of-32 cards (" + r32Cards.length + ")");
const r32Tbd = r32Cards.reduce((n, c) => n + c.querySelectorAll(".match__slot.tbd").length, 0);
ok(r32Tbd === 0, "no TBD slots in Round of 32 (all resolved), tbd=" + r32Tbd);

// ---- pick a winner in an R32 tie (bracket re-renders, so re-query) --------
const pickSlot = $$(".match")
  .find((c) => c.querySelector(".match__tag").textContent.includes("R32"))
  .querySelector(".match__slot.is-pickable");
const pickName = pickSlot.querySelector(".match__name").textContent;
click(pickSlot);
ok($$(".match__slot.winner").length >= 1, "clicking a team marks it winner (picked " + pickName + ")");

// ---- auto-fill the whole knockout via Favourites --------------------------
click($("#btnKoFavourites"));
const champLabel = $("#progressLabel").textContent;
ok(champLabel.includes("\u{1F3C6}") || champLabel.toLowerCase().includes("champion"), "champion crowned after favourites fill: " + champLabel);
const pct = $("#progressPct").textContent;
ok(pct === "100%", "progress reaches 100% with a full bracket (" + pct + ")");

// ---- summary view shows a champion ---------------------------------------
const summaryChamp = $("#summary .champ-card h2");
ok(summaryChamp && summaryChamp.textContent.trim().length > 1, "summary shows champion name: " + (summaryChamp && summaryChamp.textContent));

// ---- clearing knockouts resets picks --------------------------------------
click($("#btnKoClear"));
ok($$(".match__slot.winner").length === 0, "clear removes all winner highlights");

console.log("");
console.log(fail ? (fail + " FAILURE(S)") : "ALL DOM TESTS PASSED");
process.exitCode = fail ? 1 : 0;
