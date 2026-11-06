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
  return `<div class="stack" style="gap:2px;margin-top:8px"><h3 style="font-size:.9em">Quién eligió cada opción</h3>${rows}<p class="muted" style="font-size:.75em;margin:2px 0 0">+1 = argumentó bien (suma al ranking).</p></div>`;
}
function pickHTML(v, best) {
  if (!pick) return "";
  return `<p style="margin:6px 0 0"><b>Pedir opinión a:</b> ${esc2(pick.maj)} (${pick.majTag || "mayoría"})${pick.min ? " y " + esc2(pick.min) + " (" + (pick.minTag || "votó distinto") + ")" : ""}.</p>`;
}
function doPick() {
  const g = {}; Object.values(votes || {}).forEach(x => { if (x.op) (g[x.op] = g[x.op] || []).push(x.nombre); });
  const ks = Object.keys(g).sort((a, b) => g[b].length - g[a].length); if (!ks.length) return;
  const r = arr => arr[Math.floor(Math.random() * arr.length)];
  const rest = ks.slice(1).flatMap(k => g[k]);
  if (RES()) { // residentes: discusión escalonada, primero un R1 de la mayoría y luego un R2/R3 que votó distinto
    const all = Object.values(votes || {}).filter(x => x.op), top = ks[0];
    const yr = (x, ys) => ys.includes(x.anio);
    const r1 = all.filter(x => x.op === top && yr(x, ["R1"])), r1any = all.filter(x => yr(x, ["R1"]));
    const first = r1.length ? r(r1) : r1any.length ? r(r1any) : r(all.filter(x => x.op === top));
    const r23 = all.filter(x => x.op !== first.op && yr(x, ["R2", "R3"])), r23any = all.filter(x => yr(x, ["R2", "R3"]) && x !== first);
    const second = r23.length ? r(r23) : r23any.length ? r(r23any) : null;
    pick = { maj: first.nombre, majTag: (first.anio || "") + (first.op === top ? ", mayoría" : ""), min: second ? second.nombre : "", minTag: second ? (second.anio || "") + (second.op !== first.op ? ", votó distinto" : ", mismo voto") : "" };
    return;
  }
  pick = { maj: r(g[ks[0]]), min: rest.length ? r(rest) : "" };
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
    <div><button class="btn ghost" id="lvNew">Nuevo código</button></div></div>`;
  if (window.qrcode) { const q = qrcode(0, "M"); q.addData(url); q.make(); $id("lvQR").innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace("<svg", '<svg style="width:150px;height:150px"'); }
}
function paintPanel(S) {
  const el = $id("livePanel"); if (!el || !code || !ses) return;
  if (ses.cerrada) { el.innerHTML = `<h3>Respuestas por celular</h3><p>Sesión finalizada: el código ${code} ya no se puede usar.</p><div><button class="btn" id="lvPodium">Ver podio</button> <button class="btn primary" id="lvNew">Nueva sesión con código nuevo</button></div>`; return; }
  const n = S.node, caso = vkey(), mine = ses.caso === caso, D = A().dec(n, S.step);
  watchVotes(caso);
  // abre sola al entrar en la votación (también al repetir una decisión que quedó sin votos)
  if (autoKey !== code + "|" + caso && !(mine && (ses.abierta || tally(votes).n))) { autoKey = code + "|" + caso; openVote(); }
  else if (mine && ses.abierta) autoKey = code + "|" + caso;
  let body;
  if (mine && ses.abierta) {
    const { n: cnt } = tally(votes);
    body = `<p>Votación abierta en los celulares. Código <b style="font-family:var(--f-mono)">${code}</b>.</p>
      <div style="display:flex;align-items:center;gap:12px"><div style="flex:1;height:16px;border-radius:8px;background:var(--line,#ddd);overflow:hidden"><div id="lvBar" style="height:100%;width:100%;background:var(--ues,#A6192E)"></div></div><b id="lvSec" style="font-family:var(--f-mono);font-size:1.6em;min-width:2.2em;text-align:right">15</b></div>
      <p style="font-family:var(--f-mono);font-size:2.2em;margin:0">${cnt}</p><p class="muted" style="margin-top:0">respuesta${cnt === 1 ? "" : "s"}</p>
      <div><button class="btn" id="lvClose">Cerrar ahora</button></div>`;
  } else if (mine && tally(votes).n) {
    body = `${barsHTML(votes, (S.seen[caso] || []).includes(D.best) ? D.best : null)}${namesHTML(votes)}${pickHTML(votes, D.best)}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn" id="lvPick">Sortear quién explica</button><button class="btn" id="lvRank">Ver ranking</button></div>${rankHTML()}`;
  } else if (mine && !ses.abierta) {
    body = `<p>Votación cerrada sin respuestas. Código <b style="font-family:var(--f-mono)">${code}</b>.</p>`;
  } else {
    body = `<p>Abriendo la votación… Código <b style="font-family:var(--f-mono)">${code}</b>.</p>`;
  }
  el.innerHTML = `<h3>Respuestas por celular</h3>${body}<p class="muted" style="font-size:.7em;margin-top:10px">versión ${VER}</p>`;
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
    <button class="btn ghost" id="lvPodiumX" style="margin-top:2vh">Cerrar podio (Esc)</button>`;
}
async function finishSession() {
  if (!code || !ses) return;
  await loadRank();
  await update(ref(db, "sesiones/" + code), { cerrada: true, abierta: false });
  podium = true; paint();
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && podium) { podium = false; renderPodium(); } });

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
  if (!(S.screen === "node" && S.phase === "voto")) autoKey = null; // al volver a la votación se abre otra vez
  if (S.screen === "cover") paintCover();
  else if (S.screen === "node" && S.phase === "voto") paintPanel(S);
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
document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "lvStart") createSession();
  if (b.id === "lvNew") { const old = code; if (old) update(ref(db, "sesiones/" + old), { cerrada: true, abierta: false }).catch(() => {}); forget(); createSession(); }
  if (b.id === "lvOpen") openVote();
  if (b.id === "lvClose") closeVote();
  if (b.id === "lvCSV") downloadCSV();
  if (b.id === "lvPick") { doPick(); paint(); }
  if (b.id === "lvRank") loadRank();
  if (b.id === "lvFinish") { if (confirm("¿Finalizar la sesión? El código dejará de funcionar y no se podrá volver a usar.")) finishSession(); }
  if (b.id === "lvPodium") { loadRank().then(() => { podium = true; paint(); }); }
  if (b.id === "lvPodiumX") { podium = false; renderPodium(); }
  if (b.dataset.bonus && code) { const u = b.dataset.bonus, cur = (ses && ses.bonos && ses.bonos[u]) || 0; update(ref(db, "sesiones/" + code), { ["bonos/" + u]: cur + 1 }); }
});
window.LIVE = { mount: () => paint(), top: () => { const c = tally(votes); if (!c.n) return null; const ks = ["A","B","C","D"]; let best = null; ks.forEach(k => { if (best === null || c.c[k] > c.c[best]) best = k; }); return best; } };
paint();
