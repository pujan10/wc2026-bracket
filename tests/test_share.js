/* Round-trip test for the share-link encoder/decoder.
 * Mirrors the exact algorithm in app.js (B64 / perm factorial coding /
 * 2-bit pick coding) and checks encode->decode reproduces the state. */
const fs = require("fs");
const dir = require("path").join(__dirname, ".."); // project root
let code = fs.readFileSync(dir + "/data.js", "utf8") + "\n" +
           fs.readFileSync(dir + "/bracket.js", "utf8") + "\n";

code += `
// ---- copied verbatim from app.js ------------------------------------------
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const KO_ORDER = [
  ...R32.map((x) => x.m), ...KO_TREE.R16.map((x) => x.m),
  ...KO_TREE.QF.map((x) => x.m), ...KO_TREE.SF.map((x) => x.m), ...KO_TREE.F.map((x) => x.m),
];
const FACT = [1, 1, 2, 6];
function permToIndex(perm) { const items=[0,1,2,3]; let idx=0; for(let i=0;i<4;i++){ const pos=items.indexOf(perm[i]); idx+=pos*FACT[3-i]; items.splice(pos,1);} return idx; }
function indexToPerm(idx){ const items=[0,1,2,3]; const res=[]; for(let i=0;i<4;i++){ const f=FACT[3-i]; const pos=Math.floor(idx/f); idx%=f; res.push(items[pos]); items.splice(pos,1);} return res; }
function encodeState(s){ const bits=[]; const push=(num,w)=>{for(let j=w-1;j>=0;j--)bits.push((num>>j)&1);};
  for(const g of GROUP_LETTERS){ const drawn=GROUPS[g].map(t=>t.id); const perm=s.order[g].map(id=>drawn.indexOf(id)); push(permToIndex(perm),5);}
  let mask=0; GROUP_LETTERS.forEach((g,i)=>{ if(s.thirds.includes(g)) mask|=(1<<(11-i)); }); push(mask,12);
  const c=compute(s);
  for(const m of KO_ORDER){ const pick=s.picks[m]; const t=c.teams[m]||{}; let cd=0; if(pick&&pick===t.home)cd=1; else if(pick&&pick===t.away)cd=2; push(cd,2);}
  let str=""; for(let i=0;i<bits.length;i+=6){ let v=0; for(let j=0;j<6;j++)v=(v<<1)|(bits[i+j]||0); str+=B64[v]; } return str; }
function decodeState(str){ const bits=[]; for(const ch of str){ const v=B64.indexOf(ch); if(v<0)return null; for(let j=5;j>=0;j--)bits.push((v>>j)&1);} let p=0; const read=(w)=>{let v=0;for(let j=0;j<w;j++)v=(v<<1)|(bits[p++]||0); return v;};
  const order={}; for(const g of GROUP_LETTERS){ const drawn=GROUPS[g].map(t=>t.id); const perm=indexToPerm(read(5)); order[g]=perm.map(i=>drawn[i]); }
  const mask=read(12); const thirds=GROUP_LETTERS.filter((g,i)=>mask&(1<<(11-i)));
  const st={order,thirds,picks:{}}; for(const m of KO_ORDER){ const cd=read(2); if(!cd)continue; const c=compute(st); const t=c.teams[m]||{}; const id=cd===1?t.home:t.away; if(id)st.picks[m]=id; } return st; }

// ---- random round-trip tests ----------------------------------------------
(function () {
  let fail = 0;
  const ok = (c, m) => { if (!c) { console.error("  FAIL:", m); fail++; } };
  const shuffle = (a) => { a=a.slice(); for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];} return a; };

  let runs = 300;
  for (let r = 0; r < runs; r++) {
    const st = makeDefaultState();
    for (const g of GROUP_LETTERS) st.order[g] = shuffle(st.order[g]);
    st.thirds = shuffle(GROUP_LETTERS).slice(0, 8);
    // random partial/full knockout picks
    const rounds = [R32, KO_TREE.R16, KO_TREE.QF, KO_TREE.SF, KO_TREE.F];
    for (const list of rounds) for (const x of list) {
      const c = compute(st); const t = c.teams[x.m];
      if (t.home && t.away && Math.random() < 0.85) st.picks[x.m] = Math.random() < 0.5 ? t.home : t.away;
    }
    st.picks = compute(st).cleanPicks;

    const enc = encodeState(st);
    const dec = decodeState(enc);
    ok(!!dec, "decode produced a state");

    // order identical
    let orderOk = true;
    for (const g of GROUP_LETTERS) if (st.order[g].join() !== dec.order[g].join()) orderOk = false;
    ok(orderOk, "group orders round-trip (run " + r + ")");
    // thirds same set
    ok(st.thirds.slice().sort().join() === dec.thirds.slice().sort().join(), "thirds round-trip (run " + r + ")");
    // picks identical
    const decClean = compute(dec).cleanPicks;
    const a = Object.keys(st.picks).sort(), b = Object.keys(decClean).sort();
    let picksOk = a.join() === b.join();
    if (picksOk) for (const m of a) if (st.picks[m] !== decClean[m]) picksOk = false;
    ok(picksOk, "knockout picks round-trip (run " + r + "): " + a.length + " vs " + b.length);

    if (fail) break;
  }
  console.log(fail ? ("  " + fail + " FAILURE(S)") : "  share encode/decode: " + runs + " random brackets round-tripped cleanly");
  if (typeof process !== "undefined") process.exitCode = fail ? 1 : 0;
})();
`;

eval(code);
