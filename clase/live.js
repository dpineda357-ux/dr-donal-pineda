// Respuestas por celular para la pantalla del ponente (Firebase Realtime Database).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, update, get, onValue, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { FIREBASE_CONFIG } from "./config.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app), db = getDatabase(app);
if (FIREBASE_CONFIG.useEmulator) { connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); connectDatabaseEmulator(db, "127.0.0.1", 9000); }
const STUDENT_URL = new URL("./", location.href).href;
let uid = null, ready = false, err = "";
let code = null, ses = null, votes = {}, unsubSes = null, unsubVotes = null, votesKey = null;

const A = () => window.APP;
const KEY = () => "live-code-" + A().T.store;
const $id = id => document.getElementById(id);

onAuthStateChanged(auth, u => {
  if (!u) return;
  uid = u.uid; ready = true;
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
const openVote = n => update(ref(db, "sesiones/" + code), { caso: String(n + 1), titulo: A().CASES[n].title, abierta: true });
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

function paintCover() {
  const el = $id("liveCover"); if (!el) return;
  if (err) { el.innerHTML = `<p class="muted" style="font-size:.75em">${A().esc(err)}</p>`; return; }
  if (!ready) { el.innerHTML = `<p class="muted" style="font-size:.75em">Conectando respuestas por celular…</p>`; return; }
  if (!code) { el.innerHTML = `<button class="btn primary" id="lvStart">Activar respuestas por celular</button>`; return; }
  const url = STUDENT_URL + "?c=" + code;
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
  const n = S.node, caso = String(n + 1), mine = ses.caso === caso;
  watchVotes(caso);
  let body;
  if (mine && ses.abierta) {
    const { n: cnt } = tally(votes);
    body = `<p>Votación abierta en los celulares. Código <b style="font-family:var(--f-mono)">${code}</b>.</p>
      <p style="font-family:var(--f-mono);font-size:2.2em;margin:0">${cnt}</p><p class="muted" style="margin-top:0">respuesta${cnt === 1 ? "" : "s"}</p>
      <div><button class="btn primary" id="lvClose">Cerrar y mostrar porcentajes</button></div>`;
  } else if (mine && tally(votes).n) {
    body = `${barsHTML(votes, S.seen[n].includes(A().CASES[n].best) ? A().CASES[n].best : null)}
      <div><button class="btn ghost" id="lvOpen">Reabrir votación</button></div>`;
  } else {
    body = `<p>Código <b style="font-family:var(--f-mono)">${code}</b>. Los residentes eligen A, B, C o D en su celular.</p>
      <div><button class="btn primary" id="lvOpen">Abrir votación del caso ${n + 1}</button></div>`;
  }
  el.innerHTML = `<h3>Respuestas por celular</h3>${body}`;
}
async function paintDebrief() {
  const el = $id("liveDebrief"); if (!el || !code) return;
  el.innerHTML = `<div class="panel stack"><h3>Respuestas por celular</h3><p class="muted" style="font-size:.85em">Código ${code}. Quedan guardadas con nombre en la base de datos.</p>
    <div><button class="btn" id="lvCSV">Descargar respuestas (CSV)</button></div></div>`;
}
let last = null;
function paint() {
  const S = A() && A().S; if (!S) return;
  if (S.screen === "cover") paintCover();
  else if (S.screen === "node" && S.phase === "voto") paintPanel(S);
  else if (S.screen === "debrief") paintDebrief();
}
async function downloadCSV() {
  const snap = await get(ref(db, "votos/" + code));
  const all = snap.val() || {}, rows = [["codigo", "tema", "caso", "titulo", "nombre", "anio", "respuesta", "recomendada", "acierto", "hora"]];
  Object.entries(all).forEach(([caso, vs]) => {
    const C = A().CASES[+caso - 1]; if (!C) return;
    Object.values(vs).forEach(v => rows.push([code, A().T.title, caso, C.title, v.nombre, v.anio || "", v.op, C.best, v.op === C.best ? "1" : "0", new Date(v.t).toLocaleString()]));
  });
  const csv = "﻿" + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `respuestas-${code}.csv`; a.click();
}
document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "lvStart") createSession();
  if (b.id === "lvNew") { forget(); createSession(); }
  if (b.id === "lvOpen") openVote(A().S.node);
  if (b.id === "lvClose") closeVote();
  if (b.id === "lvCSV") downloadCSV();
});
window.LIVE = { mount: () => paint() };
paint();
