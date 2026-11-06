// Respuestas por celular para la pantalla del ponente (Firebase Realtime Database).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, update, get, onValue, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { FIREBASE_CONFIG } from "./config.js?v=20261026";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app), db = getDatabase(app);
if (FIREBASE_CONFIG.useEmulator) { connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); connectDatabaseEmulator(db, "127.0.0.1", 9000); }
const STUDENT_URL = new URL("./", location.href).href;
let uid = null, ready = false, err = "";
let rankData = null, pick = null, podium = false, autoKey = null, offset = 0, closedKey = null;
const VOTE_MS = 15000;
const VER = new URL(import.meta.url).searchParams.get("v") || "?";
let code = null, ses = null, votes = {}, unsubSes = null, unsubVotes = null, votesKey = null;

const A = () => window.APP;
const KEY = () => "live-code-" + A().T.store;
const $id = id => document.getElementById(id);

onAuthStateChanged(auth, u => {
  if (!u) return;
  uid = u.uid; ready = true;
  onValue(ref(db, ".info/serverTimeOffset"), sn => { offset = sn.val() || 0; });
  try { const c = localStorage.getItem(KEY()); if (c) attach(c); } catch (e) {}
  paint();
});
signInAnonymously(auth).catch(e => { err = "No se pudo conectar: " + e.code; paint(); });

function attach(c) {
  code = c;
  if (unsubSes) unsubSes();
  unsubSes = onValue(ref(db, "sesiones/" + c), snap => {
    ses = snap.val();
    if (!ses || ses.owner !== uid) { forget(); }
    paint();
  });
}
function forget() {
  if (unsubSes) unsubSes(); if (unsubVotes) unsubVotes();
  unsubSes = unsubVotes = null; code = ses = null; votes = {}; votesKey = null;
  try { localStorage.removeItem(KEY()); } catch (e) {}
}
async function createSession() {
  for (let i = 0; i < 20; i++) {
    const c = String(Math.floor(1000 + Math.random() * 9000));
    const r = ref(db, "sesiones/" + c);
    const s = await get(r);
    if (s.exists()) continue;
    await set(r, { owner: uid, tema: A().T.title, caso: "0", titulo: "", abierta: false, creado: Date.now() });
    try { localStorage.setItem(KEY(), c); } catch (e) {}
    attach(c); return;
  }
  err = "No se pudo crear el código; intente de nuevo."; paint();
}
function watchVotes(n) {
  const k = code + "/" + n;
  if (votesKey === k) return;
  if (unsubVotes) unsubVotes();
  votesKey = k; votes = {};
  unsubVotes = onValue(ref(db, "votos/" + code + "/" + n), snap => { votes = snap.val() || {}; paint(); });
}
const vkey = () => A().dkey(A().S.node, A().S.step);
const vtitle = () => { const S = A().S, m = A().nSteps(S.node); return A().CASES[S.node].title + (m > 1 ? " · decisión " + (S.step + 1) : ""); };
const nowS = () => Date.now() + offset;
const openVote = () => { pick = null; closedKey = null; return update(ref(db, "sesiones/" + code), { caso: vkey(), titulo: vtitle(), abierta: true, hasta: nowS() + VOTE_MS, dur: VOTE_MS }); };
const closeVote = () => update(ref(db, "sesiones/" + code), { abierta: false });

function tally(v) {
  const c = { A: 0, B: 0, C: 0, D: 0 }; let n = 0;
  Object.values(v || {}).forEach(x => { if (c[x.op] !== undefined) { c[x.op]++; n++; } });
  return { c, n };
}
function barsHTML(v, best) {
  const { c, n } = tally(v);
  return `<div class="bars">${A().KEYS.map(k => {
    const p = n ? Math.round(c[k] / n * 100) : 0;
    return `<div class="barrow"><b>${k}${best === k ? " ✓" : ""}</b><div class="bar">${c[k] ? `<span class="${k}" style="width:${p}%">${p}%</span>` : ""}</div><small>${c[k]}</small></div>`;
  }).join("")}</div><p class="muted" style="font-size:.75em">${n} respuesta${n === 1 ? "" : "s"} por celular.</p>`;
}


const esc2 = x => A().esc(x);
const RES = () => /residen/i.test(A().T.voters || "");
function namesHTML(v) {
  const g = { A: [], B: [], C: [], D: [] };
  Object.entries(v || {}).forEach(([u, x]) => { if (g[x.op]) g[x.op].push([u, x.nombre, RES() && x.anio ? x.anio : ""]); });
  const bonos = (ses && ses.bonos) || {};
  const rows = A().KEYS.filter(k => g[k].length).map(k => `<div style="display:flex;gap:6px;align-items:baseline;flex-wrap:wrap;margin:3px 0"><b style="min-width:1.4em">${k}</b>${g[k].sort((a, b) => a[1].localeCompare(b[1], "es")).map(([u, nm, an]) => `<span style="border:1px solid var(--line);border-radius:14px;padding:1px 4px 1px 9px;font-size:.82em">${an ? `<small class="muted">${esc2(an)}</small> ` : ""}${esc2(nm)}${bonos[u] ? ` <b>★${bonos[u]}</b>` : ""} <button class="btn ghost" data-bonus="${u}" title="+1 por argumentar bien" style="padding:0 6px;min-height:0;font-size:.9em">+1</button></span>`).join("")}</div>`).join("");
  return `<div class="stack" style="gap:2px;margin-top:8px"><h3 style="font-size:.9em">Quién eligió cada opción</h3>${rows}<p class="muted" style="font-size:.75em;margin:2px 0 0">+1 = argumentó bien (suma al ranking).${ses && ses.ponente ? " Ponente: " + esc2(ses.ponente) + " (no entra al sorteo)." : " Sin nombre de ponente: podría salir sorteada."}</p></div>`;
}
const PICK_MS = 60000, CLOSE_MS = 120000;
const norm = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function isPon(nombre) {
  if (!ses || !ses.ponente) return false;
  const a = norm(nombre).split(" ").filter(Boolean), b = norm(ses.ponente).split(" ").filter(Boolean);
  return !!a.length && !!b.length && (b.every(t => a.includes(t)) || a.every(t => b.includes(t)));
}
let locked = false;
function lockPage() {
  if (locked) return; locked = true; podium = false;
  try { if (unsubSes) unsubSes(); if (unsubVotes) unsubVotes(); } catch (e) {} unsubSes = unsubVotes = null; code = ses = null;
  try { sessionStorage.removeItem("casos-clave-" + location.pathname); } catch (e) {}
  try { localStorage.removeItem(KEY()); localStorage.removeItem(A().T.store); } catch (e) {}
  document.body.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:sans-serif"><div><h2>Sesión terminada</h2><p>La página se cerró. Para usarla de nuevo, abra el enlace e ingrese la clave.</p></div></div>';
}
let picks = { key: null, 1: null, 2: null };
function pickWho(n) {
  const all = Object.entries(votes || {}).map(([u, x]) => ({ u, ...x })).filter(x => x.op);
  if (!all.length) return null;
  const cnt = {}; all.forEach(x => { cnt[x.op] = (cnt[x.op] || 0) + 1; });
  const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  const r = arr => arr[Math.floor(Math.random() * arr.length)];
  const taken = [picks[1], picks[2]].filter(p => p && p.u).map(p => p.u);
  const okName = x => !isPon(x.nombre);
  const yr = (x, ys) => ys.includes(x.anio);
  // residentes: 1 mayoría, 2 votó distinto; internos: 1 votó distinto, 2 mayoría
  const kind = RES() ? (n === 1 ? "may" : "dis") : (n === 1 ? "dis" : "may");
  let pool, tag;
  if (kind === "may") {
    const base = all.filter(x => x.op === top && okName(x));
    const fresh = base.filter(x => !taken.includes(x.u));
    const prefer = RES() ? fresh.filter(x => yr(x, ["R1"])) : [];
    pool = prefer.length ? prefer : fresh.length ? fresh : base;
    tag = "mayoría";
  } else {
    const diff = all.filter(x => x.op !== top && !taken.includes(x.u) && okName(x));
    const prefer = RES() ? diff.filter(x => yr(x, ["R2", "R3"])) : [];
    pool = prefer.length ? prefer : diff;
    tag = "votó distinto";
    if (!pool.length) return { none: true };
  }
  if (!pool.length) return null;
  const p = r(pool);
  return { u: p.u, nombre: p.nombre, tag: (RES() && p.anio ? p.anio + ", " : "") + tag, until: Date.now() + PICK_MS };
}
function doPick(n) {
  const k = vkey(); if (picks.key !== k) picks = { key: k, 1: null, 2: null };
  const p = pickWho(n); if (!p) return;
  picks[n] = p.none ? { none: true, until: 0 } : p;
}
function paintTurns(S) {
  if (!(S.screen === "node" && S.phase === "voto")) return;
  const k = vkey(); if (picks.key !== k) picks = { key: k, 1: null, 2: null };
  [1, 2].forEach(n => {
    const box = document.getElementById("turn" + n); if (!box) return;
    const p = picks[n]; let pk = box.querySelector(".pk");
    const sig = p ? (p.none ? "none" : p.u + "|" + p.until) : "";
    if (!p) { if (pk) pk.remove(); return; }
    if (pk && pk.dataset.sig === sig) return;
    if (!pk) { pk = document.createElement("div"); pk.className = "pk"; box.appendChild(pk); }
    pk.dataset.sig = sig;
    pk.innerHTML = p.none ? `<span class="muted">Nadie votó distinto: pida un argumento a cualquiera.</span>`
      : `<div class="nm">${esc2(p.nombre)} <span class="muted" style="font-size:.6em;font-weight:400">(${esc2(p.tag)})</span></div><div class="bar"><i data-until="${p.until}" style="width:${Math.max(0, Math.min(100, (p.until - Date.now()) / PICK_MS * 100))}%"></i></div><div style="display:flex;gap:10px;align-items:center;margin-top:4px"><span class="muted pks" style="font-size:.8em"></span><button class="btn ghost" data-bonus="${p.u}" title="+1 por argumentar bien" style="padding:.1em .7em;font-size:.8em">+1 argumento</button><b class="pkb"></b></div>`;
  });
  paintBonus();
}
function paintBonus() {
  const bonos = (ses && ses.bonos) || {};
  [1, 2].forEach(n => { const p = picks[n], b = document.querySelector("#turn" + n + " .pkb"); if (b) b.textContent = p && p.u && bonos[p.u] ? "★" + bonos[p.u] : ""; });
}
function paintCols(S) {
  if (!(S.screen === "node" && S.phase === "voto") || !document.querySelector(".vcol")) return;
  const caso = vkey(), t = tally(votes), D = A().dec(S.node, S.step);
  const show = !!(ses && !ses.cerrada && ses.caso === caso && !ses.abierta && t.n);
  const bonos = (ses && ses.bonos) || {}, mx = Math.max(...A().KEYS.map(k => t.c[k]));
  const g = { A: [], B: [], C: [], D: [] };
  if (show) Object.entries(votes || {}).forEach(([u, x]) => { if (g[x.op]) g[x.op].push([x.nombre, u]); });
  const seenBest = (S.seen[caso] || []).includes(D.best);
  A().KEYS.forEach(k => {
    const col = document.querySelector('.vcol[data-k="' + k + '"]'); if (!col) return;
    const p = show && t.n ? Math.round(t.c[k] / t.n * 100) : 0;
    $id("vp-" + k).textContent = show ? p + "%" : "";
    $id("vn-" + k).textContent = show ? t.c[k] + (t.c[k] === 1 ? " voto" : " votos") + (seenBest && D.best === k ? " · ✓ recomendada" : "") : "";
    $id("vb-" + k).style.width = p + "%";
    col.classList.toggle("top", show && t.c[k] === mx && mx > 0);
    const names = g[k].sort((a, b) => a[0].localeCompare(b[0], "es")), MAXC = 6;
    $id("vc-" + k).innerHTML = names.slice(0, MAXC).map(([nm, u]) => `<span class="vchip">${esc2(nm)}${bonos[u] ? " ★" + bonos[u] : ""}</span>`).join("") + (names.length > MAXC ? `<span class="vchip">+${names.length - MAXC} más</span>` : "");
  });
}
async function loadRank() {
  if (!code) return;
  const snap = await get(ref(db, "votos/" + code)), all = snap.val() || {};
  const tot = {}; // uid -> {nombre, ok, n}
  Object.entries(all).forEach(([caso, vs]) => {
    const [ci, si] = caso.split("-").map(Number), n = ci - 1, st = si ? si - 1 : 0;
    const C = A().CASES[n]; if (!C || st >= A().nSteps(n)) return;
    const best = A().dec(n, st).best;
    Object.entries(vs).forEach(([u, x]) => { const t = tot[u] = tot[u] || { nombre: x.nombre, ok: 0, n: 0 }; t.n++; if (x.op === best) t.ok++; });
  });
  const bonos = (ses && ses.bonos) || {};
  rankData = Object.entries(tot).map(([u, t]) => ({ nombre: t.nombre, ok: t.ok, n: t.n, b: bonos[u] || 0, p: t.ok + (bonos[u] || 0) }))
    .sort((a, b) => b.p - a.p || b.ok - a.ok || a.nombre.localeCompare(b.nombre, "es"));
  paint();
}
function rankHTML() {
  if (!rankData) return "";
  const medal = ["🥇", "🥈", "🥉"];
  const rows = rankData.slice(0, 10).map((r, i) => `<tr><td>${medal[i] || i + 1}</td><td>${esc2(r.nombre)}</td><td style="text-align:right"><b>${r.p}</b></td><td class="muted" style="text-align:right;font-size:.85em">${r.ok} aciertos de ${r.n}${r.b ? " · ★" + r.b : ""}</td></tr>`).join("");
  return `<div class="stack" style="margin-top:8px"><h3 style="font-size:.9em">Ranking (${rankData.length} participantes)</h3><table style="width:100%;border-collapse:collapse">${rows}</table></div>`;
}

function paintCover() {
  const el = $id("liveCover"); if (!el) return;
  if (err) { el.innerHTML = `<p class="muted" style="font-size:.75em">${A().esc(err)}</p>`; return; }
  if (!ready) { el.innerHTML = `<p class="muted" style="font-size:.75em">Conectando respuestas por celular…</p>`; return; }
  if (!code) { el.innerHTML = `<button class="btn primary" id="lvStart">Activar respuestas por celular</button>`; return; }
  if (ses && ses.cerrada) { el.innerHTML = `<div class="stack" style="border-top:1px solid var(--line);padding-top:12px"><h3>Sesión finalizada</h3><p class="muted">El código ${code} ya no se puede usar. Cada sesión necesita su propio código.</p><div><button class="btn primary" id="lvNew">Nueva sesión con código nuevo</button> <button class="btn" id="lvPodium">Ver podio</button></div></div>`; return; }
  const url = STUDENT_URL + "?c=" + code + (/intern/i.test(A().T.voters || "") ? "&y=Interno" : /residen/i.test(A().T.voters || "") ? "&y=res" : "");
  el.innerHTML = `<div class="stack" style="border-top:1px solid var(--line);padding-top:12px">
    <h3>Respuestas por celular</h3>
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div id="lvQR" style="background:#fff;padding:8px;border-radius:6px;line-height:0"></div>
      <div class="stack" style="gap:4px"><span class="muted" style="font-size:.8em">Código</span>
        <b style="font-family:var(--f-mono);font-size:2.6em;letter-spacing:.08em">${code}</b>
        <span class="muted" style="font-size:.75em;word-break:break-all">${A().esc(url)}</span></div>
    </div>
    <div class="stack" style="gap:4px"><label class="muted" style="font-size:.8em" for="lvPon">Nombre de quien presenta, el ponente (vota y suma puntos, pero no entra al sorteo)</label>
      <input id="lvPon" value="${A().esc((ses && ses.ponente) || "")}" placeholder="Nombre y apellido tal como lo escribirá" style="font:inherit;padding:.5em .7em;border:1.5px solid var(--line);border-radius:8px;max-width:360px"></div>
    <div><button class="btn ghost" id="lvNew">Nuevo código</button></div></div>`;
  if (window.qrcode) { const q = qrcode(0, "M"); q.addData(url); q.make(); $id("lvQR").innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace("<svg", '<svg style="width:150px;height:150px"'); }
}
function paintPanel(S) {
  const el = $id("livePanel"); if (!el || !code || !ses) return;
  if (ses.cerrada) { el.innerHTML = `<h3>Respuestas por celular</h3><p>Sesión finalizada: el código ${code} ya no se puede usar.</p><div><button class="btn" id="lvPodium">Ver podio</button> <button class="btn primary" id="lvNew">Nueva sesión con código nuevo</button></div>`; return; }
  const n = S.node, caso = vkey(), mine = ses.caso === caso, D = A().dec(n, S.step);
  watchVotes(caso);
  // abre sola al entrar en la votación (también al repetir una decisión que quedó sin votos)
  if (autoKey !== code + "|" + caso && !(mine && (ses.abierta || tally(votes).n))) { autoKey = code + "|" + caso; setTimeout(openVote, 0); }
  else if (mine && ses.abierta) autoKey = code + "|" + caso;
  let body;
  if (mine && ses.abierta) {
    const { n: cnt } = tally(votes);
    body = `<b>Votación abierta</b><span class="muted">código <b style="font-family:var(--f-mono)">${code}</b></span>
      <div style="flex:1;min-width:140px;height:16px;border-radius:8px;background:var(--line,#ddd);overflow:hidden"><div id="lvBar" style="height:100%;width:100%;background:var(--ues,#A6192E)"></div></div><b id="lvSec" style="font-family:var(--f-mono);font-size:1.6em;min-width:1.6em;text-align:right">15</b><span class="muted">s</span><span style="width:12px"></span>
      <span><b style="font-family:var(--f-mono);font-size:1.6em">${cnt}</b> respuesta${cnt === 1 ? "" : "s"}</span><button class="btn" id="lvClose">Cerrar ahora</button>`;
  } else if (mine && tally(votes).n) {
    const nn = tally(votes).n;
    body = `<b>${nn} respuesta${nn === 1 ? "" : "s"}</b><button class="btn" id="lvPick1">Sortear 1 · ${RES() ? "un R1 de la mayoría" : "votó distinto"}</button><button class="btn" id="lvPick2">Sortear 2 · ${RES() ? "un R2/R3 que votó distinto" : "de la mayoría"}</button><button class="btn" id="lvRank">Ver ranking</button>${ses.ponente ? "" : `<span class="muted" style="font-size:.8em">Sin nombre de ponente: podría salir sorteado.</span>`}${rankData ? `<div style="flex-basis:100%">${rankHTML()}</div>` : ""}`;
  } else if (mine && !ses.abierta) {
    body = `<b>Votación cerrada sin respuestas</b><span class="muted">código <b style="font-family:var(--f-mono)">${code}</b></span>`;
  } else {
    body = `<b>Abriendo la votación…</b><span class="muted">código <b style="font-family:var(--f-mono)">${code}</b></span>`;
  }
  el.innerHTML = `${body}<span class="muted" style="font-size:.7em;margin-left:auto">v ${VER}</span>`;
}
async function paintDebrief() {
  const el = $id("liveDebrief"); if (!el || !code) return;
  el.innerHTML = `<div class="panel stack"><h3>Respuestas por celular</h3><p class="muted" style="font-size:.85em">Código ${code}. Quedan guardadas con nombre en la base de datos. «Finalizar» cierra el código: no se puede volver a usar.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${ses && ses.cerrada ? '<button class="btn primary" id="lvPodium">Ver podio</button>' : '<button class="btn primary" id="lvFinish">Finalizar sesión y mostrar podio</button>'}<button class="btn" id="lvRank">Ver ranking</button><button class="btn" id="lvCSV">Descargar respuestas (CSV)</button></div>${rankHTML()}</div>`;
}

function podiumRows() {
  if (!rankData || !rankData.length) return [];
  const out = []; let place = 0;
  rankData.forEach((r, i) => { if (i === 0 || r.p !== rankData[i - 1].p || r.ok !== rankData[i - 1].ok) place = i + 1; if (place <= 3) out.push({ place, ...r }); });
  return out;
}
function renderPodium() {
  let el = document.getElementById("lvPodiumFull");
  if (!podium) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "lvPodiumFull"; document.body.appendChild(el); }
  const medal = ["🥇", "🥈", "🥉"], rows = podiumRows();
  el.style.cssText = "position:fixed;inset:0;z-index:9999;background:var(--bg,#fff);color:var(--ink,#111);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.2vh;padding:4vh 6vw;text-align:center;overflow:auto";
  el.innerHTML = `<div style="letter-spacing:.2em;font-size:clamp(14px,2vw,22px);color:var(--ues,#A6192E);font-weight:700">PODIO · MEJORES PUNTAJES</div>
    ${rows.length ? rows.map(r => `<div style="font-size:${r.place === 1 ? "clamp(34px,7vw,92px)" : "clamp(26px,5vw,64px)"};font-weight:${r.place === 1 ? 800 : 700};line-height:1.1">${medal[r.place - 1]} ${esc2(r.nombre)} <span style="font-family:var(--f-mono,monospace);font-weight:600;font-size:.55em;color:var(--ues,#A6192E)">${r.p} ${r.p === 1 ? "punto" : "puntos"}</span></div>`).join("") : `<div style="font-size:clamp(20px,3vw,36px)">Sin participantes.</div>`}
    <div style="font-size:clamp(12px,1.5vw,18px);opacity:.7">Aciertos más puntos por argumentar. Gracias por participar.</div>
    <button class="btn ghost" id="lvPodiumX" style="margin-top:2vh">Cerrar podio (Esc)</button><div id="lvLockTxt" class="muted" style="font-size:clamp(12px,1.6vw,18px)"></div>`;
}
async function finishSession() {
  if (!code || !ses) return;
  await loadRank();
  await update(ref(db, "sesiones/" + code), { cerrada: true, abierta: false, cierre: nowS() + CLOSE_MS });
  podium = true; paint();
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && podium) { podium = false; renderPodium(); } });

setInterval(() => {
  if (ses && ses.cerrada && ses.cierre) {
    const rem = ses.cierre - nowS();
    if (rem <= 0) { lockPage(); return; }
    const t = document.getElementById("lvLockTxt"); if (t) { const tt = Math.ceil(rem / 1000); t.textContent = "La página se cerrará sola en " + Math.floor(tt / 60) + ":" + String(tt % 60).padStart(2, "0"); }
  }
  document.querySelectorAll(".pk .bar i").forEach(b => {
    const rem = Math.max(0, +b.dataset.until - Date.now());
    b.style.width = (rem / PICK_MS * 100) + "%";
    const t = b.closest(".pk").querySelector(".pks"); if (t) t.textContent = rem > 0 ? Math.ceil(rem / 1000) + " s" : "Tiempo agotado";
  });
}, 200);
setInterval(() => {
  if (!code || !ses || !ses.abierta || !ses.hasta || ses.cerrada) return;
  const rem = ses.hasta - nowS(), dur = ses.dur || VOTE_MS;
  const bar = document.getElementById("lvBar"), sec = document.getElementById("lvSec");
  if (bar) { bar.style.width = Math.max(0, Math.min(100, rem / dur * 100)) + "%"; bar.style.background = rem < 5000 ? "#c62828" : "var(--ues,#A6192E)"; }
  if (sec) sec.textContent = Math.max(0, Math.ceil(rem / 1000));
  const k = ses.caso + "|" + ses.hasta;
  if (rem <= 0 && closedKey !== k) { closedKey = k; closeVote(); }
}, 100);
let last = null;
function paint() {
  const S = A() && A().S; if (!S) return;
  renderPodium();
  paintTurns(S); paintBonus();
  if (!(S.screen === "node" && S.phase === "voto")) autoKey = null; // al volver a la votación se abre otra vez
  if (S.screen === "cover") paintCover();
  else if (S.screen === "node" && S.phase === "voto") { paintPanel(S); paintCols(S); }
  else if (S.screen === "debrief") paintDebrief();
}
async function downloadCSV() {
  const snap = await get(ref(db, "votos/" + code));
  const all = snap.val() || {}, rows = [["codigo", "tema", "caso", "titulo", "nombre", "anio", "respuesta", "recomendada", "acierto", "hora"]];
  Object.entries(all).forEach(([caso, vs]) => {
    const [ci, si] = caso.split("-").map(Number), n = ci - 1, st = si ? si - 1 : 0;
    const C = A().CASES[n]; if (!C || st >= A().nSteps(n)) return;
    const D = A().dec(n, st);
    Object.values(vs).forEach(v => rows.push([code, A().T.title, caso, C.title, v.nombre, v.anio || "", v.op, D.best, v.op === D.best ? "1" : "0", new Date(v.t).toLocaleString()]));
  });
  const csv = "﻿" + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `respuestas-${code}.csv`; a.click();
}
document.addEventListener("change", e => {
  if (e.target && e.target.id === "lvPon" && code) update(ref(db, "sesiones/" + code), { ponente: e.target.value.trim().slice(0, 60) }).catch(() => {});
});
document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "lvStart") createSession();
  if (b.id === "lvNew") { const old = code; if (old) update(ref(db, "sesiones/" + old), { cerrada: true, abierta: false }).catch(() => {}); forget(); createSession(); }
  if (b.id === "lvOpen") openVote();
  if (b.id === "lvClose") closeVote();
  if (b.id === "lvCSV") downloadCSV();
  if (b.id === "lvPick1") { doPick(1); paint(); }
  if (b.id === "lvPick2") { doPick(2); paint(); }
  if (b.id === "lvRank") loadRank();
  if (b.id === "lvFinish") { if (confirm("¿Finalizar la sesión? El código dejará de funcionar y no se podrá volver a usar.")) finishSession(); }
  if (b.id === "lvPodium") { loadRank().then(() => { podium = true; paint(); }); }
  if (b.id === "lvPodiumX") { podium = false; renderPodium(); }
  if (b.dataset.bonus && code) { const u = b.dataset.bonus, cur = (ses && ses.bonos && ses.bonos[u]) || 0; update(ref(db, "sesiones/" + code), { ["bonos/" + u]: cur + 1 }); }
});
window.LIVE = { mount: () => paint(), top: () => { const c = tally(votes); if (!c.n) return null; const ks = ["A","B","C","D"]; let best = null; ks.forEach(k => { if (best === null || c.c[k] > c.c[best]) best = k; }); return best; } };
paint();
