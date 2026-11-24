import { db } from "./firebase.js";
import {
  ref, onValue, onChildAdded, onChildRemoved, push, update, remove, query, orderByChild, limitToLast
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { $, el, fmtTime, fmtClock, fmtDay, toast } from "./util.js";
import { me, getProfile, paintAvatar } from "./profile.js";

const isMobile = () => matchMedia("(max-width: 760px)").matches;
const SEND = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14-7-5 14-2-6z"/></svg>';
const PLUS = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const BACK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const TRASH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

let built = false, unTopics = null, unMsgs = [];
let topics = {}, curId = null, last = { uid: null, t: 0, day: "" };
let raf = 0, stick = true;

const denied = (e) => e && (e.code === "PERMISSION_DENIED" || /permission[_ ]denied/i.test(e.message || ""));
function fail(e, msg) {
  console.error(e);
  if (denied(e)) {
    const b = $("cBanner");
    b.textContent = "Firebase refuse l’accès : publie les règles du fichier firebase-rules.json (Realtime Database → Règles), puis recharge la page.";
    b.hidden = false;
  } else toast(msg);
}

function build() {
  if (built) return;
  built = true;
  $("community").innerHTML = `
  <main class="cpane" id="cChat">
    <div class="empty" id="cEmpty">
      <img src="favicon.svg" alt="" width="84" height="84">
      <h2>Community</h2>
      <p class="muted">Choisis un sujet ou lance la discussion.</p>
      <button class="btn primary" id="cEmptyNew" type="button">Nouveau sujet</button>
    </div>
    <header class="topbar">
      <button class="ib mobile-only" id="cBack" type="button" aria-label="Retour aux sujets">${BACK}</button>
      <div class="ctitle"><b id="cTopic"></b><small id="cMeta" class="muted"></small></div>
      <button class="ib" id="cDel" type="button" hidden aria-label="Supprimer le sujet" title="Supprimer le sujet">${TRASH}</button>
    </header>
    <div class="msgs" id="cMsgs" aria-live="polite"></div>
    <form class="composer" id="cForm">
      <textarea id="cInput" rows="1" maxlength="2000" placeholder="Écris un message…" aria-label="Message"></textarea>
      <button class="ib accent" id="cSend" type="submit" aria-label="Envoyer">${SEND}</button>
    </form>
  </main>
  <aside class="cpane" id="cList">
    <header class="listhead">
      <h2>Community</h2>
      <button class="ib accent" id="cNewBtn" type="button" aria-label="Nouveau sujet" title="Nouveau sujet">${PLUS}</button>
    </header>
    <p class="banner" id="cBanner" hidden role="alert"></p>
    <div class="searchwrap"><input id="cSearch" type="search" placeholder="Rechercher un sujet" aria-label="Rechercher un sujet"></div>
    <div class="list" id="cTopics"></div>
    <p class="muted list-empty" id="cNone" hidden>Aucun sujet pour l’instant. Lance le premier !</p>
    <button class="fab mobile-only" id="cFab" type="button" aria-label="Nouveau sujet">${PLUS}</button>
  </aside>
  <dialog id="cNewDlg">
    <form class="sheet" id="cNewForm" method="dialog">
      <h3>Nouveau sujet</h3>
      <div class="field"><label for="cNewTitle">De quoi veux-tu parler ?</label>
        <input id="cNewTitle" class="textin" maxlength="120" placeholder="Ex. Vos meilleures idées de projets" required></div>
      <div class="field"><label for="cNewMsg">Premier message (facultatif)</label>
        <textarea id="cNewMsg" class="textin" rows="3" maxlength="2000" placeholder="Lance la discussion…"></textarea></div>
      <div class="row-end">
        <button class="btn ghost" type="button" id="cNewCancel">Annuler</button>
        <button class="btn primary" type="submit">Publier</button>
      </div>
    </form>
  </dialog>`;

  const dlg = $("cNewDlg");
  const openNew = () => { $("cNewForm").reset(); dlg.showModal(); $("cNewTitle").focus(); };
  $("cNewBtn").onclick = $("cFab").onclick = $("cEmptyNew").onclick = openNew;
  $("cNewCancel").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  $("cNewForm").onsubmit = () => { createTopic($("cNewTitle").value.trim(), $("cNewMsg").value.trim()); };

  $("cSearch").oninput = renderTopics;
  $("cBack").onclick = () => { if (history.state && history.state.c) history.back(); else closeTopic(); };
  addEventListener("popstate", () => { if ($("community").classList.contains("chatting")) closeTopic(); });
  $("cDel").onclick = deleteTopic;

  const input = $("cInput");
  const grow = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; };
  input.addEventListener("input", grow);
  const toBottom = () => { const b = $("cMsgs"); b.scrollTop = b.scrollHeight; };
  input.addEventListener("focus", () => setTimeout(toBottom, 350));
  addEventListener("tc:vv", () => { if (document.activeElement === input) toBottom(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && matchMedia("(pointer: fine)").matches) { e.preventDefault(); $("cForm").requestSubmit(); }
  });
  $("cForm").onsubmit = (e) => { e.preventDefault(); send(); grow(); };
  $("cMsgs").addEventListener("click", (e) => {
    const b = e.target.closest(".mdel");
    if (b && confirm("Supprimer ce message ?")) remove(ref(db, `community/messages/${curId}/${b.closest(".m").dataset.id}`)).catch(() => toast("Suppression impossible."));
  });
}

/* ---------- Sujets ---------- */
export function start() {
  build();
  if (unTopics) return;
  const q = query(ref(db, "community/topics"), orderByChild("lastAt"), limitToLast(100));
  unTopics = onValue(q, (s) => { $("cBanner").hidden = true; topics = s.val() || {}; renderTopics(); syncHeader(); },
    (e) => fail(e, "Impossible de charger la communauté."));
}

export function stop() {
  if (unTopics) unTopics();
  unTopics = null; topics = {};
  closeStreams(); curId = null;
  if (built) { $("community").classList.remove("chatting"); $("cEmpty").hidden = false; $("cTopics").replaceChildren(); }
}

function topicItem(t) {
  const av = el("span", { class: "avatar" });
  paintAvatar(av, null, t.title);
  getProfile(t.uid).then((p) => paintAvatar(av, p, t.title));
  const r1 = el("div", { class: "r1" }, el("span", { class: "name", text: t.title }), el("time", { text: fmtTime(t.lastAt) }));
  const prev = t.lastText ? `${t.lastName || "Membre"} : ${t.lastText}` : "Aucun message";
  const r2 = el("div", { class: "r2" }, el("span", { class: "preview", text: prev }));
  const b = el("button", { class: "item" + (t.id === curId ? " active" : ""), type: "button" }, av, el("div", { class: "meta" }, r1, r2));
  b.onclick = () => openTopic(t.id);
  return b;
}

function renderTopics() {
  if (!built) return;
  const q = $("cSearch").value.trim().toLowerCase();
  const arr = Object.entries(topics).map(([id, t]) => ({ id, ...t }))
    .filter((t) => !q || (t.title || "").toLowerCase().includes(q))
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  $("cTopics").replaceChildren(...arr.map(topicItem));
  $("cNone").hidden = arr.length > 0;
  $("cNone").textContent = q ? "Aucun sujet trouvé." : "Aucun sujet pour l’instant. Lance le premier !";
}

function syncHeader() {
  if (!curId) return;
  const t = topics[curId];
  if (!t) { closeTopic(); return; }
  $("cDel").hidden = t.uid !== me.uid;
}

async function createTopic(title, first) {
  if (!title || !me.uid) return;
  const r = push(ref(db, "community/topics")), now = Date.now(), name = me.name || "Membre";
  const t = { title, uid: me.uid, name, createdAt: now, lastAt: now, lastText: first.slice(0, 120), lastName: first ? name : "" };
  if (!first) { delete t.lastText; delete t.lastName; }
  try {
    await update(ref(db), {
      [`community/topics/${r.key}`]: t,
      ...(first ? { [`community/messages/${r.key}/${push(ref(db, `community/messages/${r.key}`)).key}`]: { uid: me.uid, name, text: first, t: now } } : {})
    });
    topics[r.key] = t;
    openTopic(r.key);
  } catch (e) { delete topics[r.key]; renderTopics(); fail(e, "Publication impossible. Réessaie."); }
}

async function deleteTopic() {
  const t = topics[curId];
  if (!t || t.uid !== me.uid || !confirm("Supprimer ce sujet et tous ses messages ?")) return;
  const id = curId;
  closeTopic();
  if (history.state && history.state.c) history.back();
  try {
    await remove(ref(db, `community/messages/${id}`));
    await remove(ref(db, `community/topics/${id}`));
  } catch (e) { fail(e, "Suppression impossible."); }
}

/* ---------- Conversation ---------- */
function closeStreams() { unMsgs.forEach((u) => u()); unMsgs = []; }

function openTopic(id) {
  closeStreams();
  curId = id;
  const t = topics[id];
  $("cTopic").textContent = t.title;
  $("cMeta").textContent = "";
  getProfile(t.uid).then((p) => { if (curId === id) $("cMeta").textContent = "Lancé par " + (p.name || t.name || "un membre"); });
  $("cDel").hidden = t.uid !== me.uid;
  $("cMsgs").replaceChildren();
  last = { uid: null, t: 0, day: "" };
  $("cEmpty").hidden = true;
  $("community").classList.add("chatting");
  if (isMobile() && !(history.state && history.state.c)) history.pushState({ c: 1 }, "");
  const q = query(ref(db, `community/messages/${id}`), limitToLast(150));
  unMsgs = [
    onChildAdded(q, (s) => addMsg(s.key, s.val())),
    onChildRemoved(q, (s) => { const n = $("cMsgs").querySelector(`[data-id="${s.key}"]`); if (n) n.remove(); })
  ];
  renderTopics();
  if (!isMobile()) $("cInput").focus();
}

function closeTopic() {
  closeStreams();
  curId = null;
  $("community").classList.remove("chatting");
  $("cEmpty").hidden = false;
  renderTopics();
}

const URL_RE = /(https?:\/\/[^\s<]+)/g;
function linkify(text) {
  const frag = document.createDocumentFragment();
  text.split(URL_RE).forEach((part, i) => {
    if (i % 2) frag.append(el("a", { href: part, target: "_blank", rel: "noopener noreferrer", text: part }));
    else if (part) frag.append(part);
  });
  return frag;
}

function addMsg(key, m) {
  const box = $("cMsgs");
  if (!m || !m.text) return;
  if (!raf) {
    stick = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    raf = requestAnimationFrame(() => { raf = 0; if (stick) box.scrollTop = box.scrollHeight; });
  }
  if (m.uid === me.uid) stick = true;
  const day = new Date(m.t).toDateString();
  if (day !== last.day) { box.append(el("div", { class: "day", text: fmtDay(m.t) })); last.uid = null; }
  const cont = last.uid === m.uid && m.t - last.t < 5 * 60e3 && day === last.day;
  last = { uid: m.uid, t: m.t, day };
  const own = m.uid === me.uid;
  const av = el("span", { class: "avatar" });
  paintAvatar(av, null, m.name);
  getProfile(m.uid).then((p) => paintAvatar(av, p, m.name));
  const txt = el("div", { class: "txt" }); txt.append(linkify(m.text));
  const bub = el("div", { class: "bub" }, el("b", { class: "who", text: m.name || "Membre" }), txt, el("time", { text: fmtClock(m.t) }));
  if (own) bub.append(el("button", { class: "mdel", type: "button", "aria-label": "Supprimer ce message", text: "×" }));
  const row = el("div", { class: "m" + (own ? " me" : "") + (cont ? " cont" : ""), "data-id": key }, av, bub);
  box.append(row);
}

async function send() {
  const input = $("cInput"), text = input.value.trim();
  if (!text || !curId || !me.uid) return;
  input.value = "";
  const now = Date.now(), name = me.name || "Membre";
  const key = push(ref(db, `community/messages/${curId}`)).key;
  try {
    await update(ref(db), {
      [`community/messages/${curId}/${key}`]: { uid: me.uid, name, text, t: now },
      [`community/topics/${curId}/lastAt`]: now,
      [`community/topics/${curId}/lastText`]: text.slice(0, 120),
      [`community/topics/${curId}/lastName`]: name
    });
  } catch (e) { input.value = text; fail(e, "Message non envoyé. Réessaie."); }
}
