import { auth, db, post } from "./firebase.js";
import { FONTS, SIZES } from "./settings.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase, ref, onValue, push, set, update, remove
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";


/* ---------- Raccourcis ---------- */
const $ = (id) => document.getElementById(id);
const isMobile = () => matchMedia("(max-width: 760px)").matches;
const notesRef = () => ref(db, `users/${uid}/notes`);
const noteRef = (id) => ref(db, `users/${uid}/notes/${id}`);

/* ---------- État ---------- */
let uid = null, unsub = null;
let notes = {};
let currentId = null;
let saveTimer = null, dirty = false;
const lastSaved = {};
let statusText = "";

const NOTE_COLORS = ["", "#ffd9a8", "#ffe58a", "#c8f0b4", "#a9e6dc", "#b8dcff", "#d9c8ff", "#ffc6dd"];

onAuthStateChanged(auth, (user) => {
  if (user) {
    uid = user.uid;
    $("auth").hidden = true;
    $("app").hidden = false;
    post({ type: "talco-hello", email: user.email });
    post({ type: "talco-ready" });
    try { notes = JSON.parse(localStorage.getItem("notes-cache-" + uid) || "{}"); } catch { notes = {}; }
    renderList();
    if (unsub) unsub();
    unsub = onValue(notesRef(), (snap) => {
      notes = snap.val() || {};
      try { localStorage.setItem("notes-cache-" + uid, JSON.stringify(notes)); } catch {}
      syncCurrent();
      renderList();
    });
  } else {
    if (unsub) unsub();
    unsub = null; uid = null; notes = {}; currentId = null;
    $("app").hidden = true;
    $("auth").hidden = false;
    $("app").classList.remove("editing");
    post({ type: "talco-hello", email: null });
  }
});

/* ---------- Liste ---------- */
const textOf = (html) => new DOMParser().parseFromString(html || "", "text/html").body.textContent || "";

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts), n = new Date();
  if (d.toDateString() === n.toDateString())
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date(n - 864e5).toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function itemEl(n) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "item" + (n.id === currentId ? " active" : "");
  const av = document.createElement("span");
  av.className = "avatar";
  av.textContent = (n.title || "N").trim().charAt(0).toUpperCase() || "N";
  if (n.color) av.style.setProperty("--c", n.color);
  const meta = document.createElement("div");
  meta.className = "meta";
  const r1 = document.createElement("div"); r1.className = "r1";
  const name = document.createElement("span"); name.className = "name";
  name.textContent = n.title || "Sans titre";
  const time = document.createElement("time"); time.textContent = fmtTime(n.updatedAt);
  r1.append(name, time);
  const r2 = document.createElement("div"); r2.className = "r2";
  const pv = document.createElement("span"); pv.className = "preview";
  pv.textContent = textOf(n.html).trim().slice(0, 90) || "Note vide";
  r2.append(pv);
  if (n.pinned) { const p = document.createElement("span"); p.className = "pin"; p.textContent = "📌"; r2.append(p); }
  meta.append(r1, r2);
  b.append(av, meta);
  b.onclick = () => openNote(n.id);
  return b;
}

function renderList() {
  const q = $("search").value.trim().toLowerCase();
  const arr = Object.entries(notes)
    .map(([id, n]) => ({ id, ...n }))
    .filter((n) => !q || (n.title || "").toLowerCase().includes(q) || textOf(n.html).toLowerCase().includes(q))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  $("list").replaceChildren(...arr.map(itemEl));
  $("listEmpty").hidden = arr.length > 0;
  $("listEmpty").textContent = q ? "Aucune note trouvée." : "Pas encore de note. Touche + pour écrire la première.";
}
$("search").oninput = renderList;

/* ---------- Notes ---------- */
const editor = $("editor"), noteTitle = $("noteTitle");

function loadIntoEditor(n) {
  noteTitle.value = n.title || "";
  editor.innerHTML = n.html || "";
  applyMeta(n);
  dirty = false;
  statusText = "";
  updateStatus();
}
function applyMeta(n) {
  $("editorPane").style.setProperty("--note", n.color || "var(--surface)");
  $("pinBtn").classList.toggle("on", !!n.pinned);
}
function updateStatus() {
  const words = (editor.innerText || "").trim().split(/\s+/).filter(Boolean).length;
  $("status").textContent = [statusText, words + (words > 1 ? " mots" : " mot")].filter(Boolean).join(" · ");
}
function focusInEditor() {
  return document.activeElement === editor || document.activeElement === noteTitle;
}

function syncCurrent() {
  if (!currentId) return;
  const n = notes[currentId];
  if (!n) { closeNote(); return; }
  applyMeta(n);
  if (!dirty && n.updatedAt !== lastSaved[currentId] && !focusInEditor()) {
    loadIntoEditor(n);
    lastSaved[currentId] = n.updatedAt;
  }
}

function openNote(id) {
  if (currentId && currentId !== id) flush();
  currentId = id;
  const n = notes[id];
  loadIntoEditor(n);
  lastSaved[id] = n.updatedAt;
  $("emptyState").hidden = true;
  $("app").classList.add("editing");
  if (isMobile() && !(history.state && history.state.n)) history.pushState({ n: 1 }, "");
  renderList();
}

function closeNote() {
  flush();
  currentId = null;
  $("app").classList.remove("editing");
  $("emptyState").hidden = false;
  renderList();
}

async function newNote() {
  if (!uid) return;
  flush();
  const r = push(notesRef());
  const now = Date.now();
  const data = { title: "", html: "", color: "", pinned: false, createdAt: now, updatedAt: now };
  notes[r.key] = data;
  lastSaved[r.key] = now;
  openNote(r.key);
  noteTitle.focus();
  try { await set(r, data); } catch { statusText = "Erreur d’enregistrement"; updateStatus(); }
}

function scheduleSave() {
  if (!currentId) return;
  dirty = true;
  statusText = "Enregistrement…";
  updateStatus();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 700);
}

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!currentId || !notes[currentId]) return;
  const id = currentId;
  const now = Date.now();
  const data = { title: noteTitle.value, html: editor.innerHTML, updatedAt: now };
  Object.assign(notes[id], data);
  lastSaved[id] = now;
  dirty = false;
  renderList();
  try {
    await update(noteRef(id), data);
    if (id === currentId && !dirty) statusText = "Enregistré";
  } catch {
    statusText = "Erreur d’enregistrement";
  }
  if (id === currentId) updateStatus();
}
function flush() { if (saveTimer) saveNow(); }

noteTitle.addEventListener("input", scheduleSave);
noteTitle.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); editor.focus(); } });
editor.addEventListener("input", () => {
  if (editor.innerHTML === "<br>") editor.innerHTML = "";
  scheduleSave();
});

$("newBtn").onclick = newNote;
$("fab").onclick = newNote;
$("emptyNew").onclick = newNote;

$("backBtn").onclick = () => { if (history.state && history.state.n) history.back(); else closeNote(); };
addEventListener("popstate", () => { if ($("app").classList.contains("editing")) closeNote(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
addEventListener("pagehide", flush);
addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveNow(); }
});

$("delBtn").onclick = async () => {
  if (!currentId) return;
  if (!confirm("Supprimer cette note ? Cette action est définitive.")) return;
  const id = currentId;
  clearTimeout(saveTimer); saveTimer = null;
  delete notes[id];
  closeNote();
  if (history.state && history.state.n) history.back();
  try { await remove(noteRef(id)); } catch {}
};

$("pinBtn").onclick = async () => {
  if (!currentId) return;
  const n = notes[currentId];
  n.pinned = !n.pinned;
  applyMeta(n);
  renderList();
  try { await update(noteRef(currentId), { pinned: n.pinned }); } catch {}
};

/* Couleur de la note */
const colorDlg = $("colorDlg");
NOTE_COLORS.forEach((c) => {
  const b = document.createElement("button");
  b.type = "button";
  b.style.setProperty("--c", c || "var(--surface)");
  b.setAttribute("aria-label", c ? "Couleur " + c : "Sans couleur");
  b.onclick = async () => {
    if (!currentId) return;
    notes[currentId].color = c;
    applyMeta(notes[currentId]);
    renderList();
    colorDlg.close();
    try { await update(noteRef(currentId), { color: c }); } catch {}
  };
  $("noteColors").append(b);
});
$("colorBtn").onclick = () => colorDlg.showModal();

/* ---------- Éditeur : mise en forme ---------- */
document.execCommand("defaultParagraphSeparator", false, "p");
let savedRange = null;

function closestEl(sel) {
  const n = savedRange && savedRange.startContainer;
  const el = n && (n.nodeType === 1 ? n : n.parentElement);
  return el ? el.closest(sel) : null;
}
document.addEventListener("selectionchange", () => {
  const s = getSelection();
  if (s.rangeCount && editor.contains(s.anchorNode)) {
    savedRange = s.getRangeAt(0).cloneRange();
    updateToolbarState();
    $("tableBar").hidden = !closestEl("td,th");
  }
});
function restore() {
  editor.focus();
  if (savedRange) {
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(savedRange);
  }
}
function exec(cmd, val = null) {
  if (!currentId) return;
  restore();
  document.execCommand("styleWithCSS", false, true);
  document.execCommand(cmd, false, val);
  scheduleSave();
}
function updateToolbarState() {
  document.querySelectorAll("#toolbar [data-cmd]").forEach((b) => {
    const c = b.dataset.cmd;
    if (["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList"].includes(c)) {
      let on = false;
      try { on = document.queryCommandState(c); } catch {}
      b.classList.toggle("on", on);
    }
  });
  try {
    const v = (document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, "");
    $("blockSel").value = ["h1", "h2", "h3", "blockquote"].includes(v) ? v : "p";
  } catch {}
}

/* Les boutons gardent la sélection */
$("toolbar").addEventListener("mousedown", (e) => {
  if (e.target.closest("button")) e.preventDefault();
});
$("tableBar").addEventListener("mousedown", (e) => e.preventDefault());

const tableDlg = $("tableDlg");
function insertChecklist() {
  restore();
  const li = closestEl("li");
  if (li) { li.parentElement.classList.toggle("checklist"); scheduleSave(); return; }
  document.execCommand("insertHTML", false, '<ul class="checklist"><li><br></li></ul>');
  scheduleSave();
}
$("toolbar").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cmd]");
  if (!b) return;
  const c = b.dataset.cmd;
  if (c === "checklist") insertChecklist();
  else if (c === "table") tableDlg.showModal();
  else if (c === "link") {
    const sel = savedRange ? savedRange.toString() : "";
    let url = prompt("Adresse du lien", "https://");
    if (!url || url === "https://") return;
    if (!/^(https?:|mailto:|tel:)/i.test(url)) url = "https://" + url;
    if (sel) exec("createLink", url);
    else exec("insertHTML", `<a href="${encodeURI(url)}">${encodeURI(url)}</a>&nbsp;`);
  }
  else if (c === "hr") exec("insertHorizontalRule");
  else if (c === "clear") { exec("removeFormat"); exec("formatBlock", "p"); }
  else exec(c);
});

/* Police, taille, style */
FONTS.forEach(([n, v]) => {
  const o = document.createElement("option");
  o.value = v; o.textContent = n;
  $("fontSel").append(o);
});
SIZES.forEach((s) => {
  const o = document.createElement("option");
  o.value = s; o.textContent = s;
  $("sizeSel").append(o);
});
$("sizeSel").value = 18;
$("fontSel").onchange = (e) => exec("fontName", e.target.value);
$("blockSel").onchange = (e) => exec("formatBlock", e.target.value);
$("sizeSel").onchange = (e) => {
  if (!currentId) return;
  restore();
  document.execCommand("styleWithCSS", false, false);
  document.execCommand("fontSize", false, "7");
  editor.querySelectorAll('font[size="7"]').forEach((f) => {
    const s = document.createElement("span");
    s.style.fontSize = e.target.value + "px";
    s.innerHTML = f.innerHTML;
    f.replaceWith(s);
  });
  scheduleSave();
};

/* Couleurs du texte / surlignage */
$("fgColor").addEventListener("input", (e) => {
  $("fgMark").style.setProperty("--m", e.target.value);
  exec("foreColor", e.target.value);
});
$("hlColor").addEventListener("input", (e) => {
  $("hlMark").style.setProperty("--m", e.target.value);
  exec("hiliteColor", e.target.value);
});

/* Cases à cocher */
editor.addEventListener("click", (e) => {
  const li = e.target.closest && e.target.closest("li");
  if (li && e.target === li && li.parentElement.classList.contains("checklist")) {
    if (e.clientX - li.getBoundingClientRect().left < 34) { li.classList.toggle("done"); scheduleSave(); }
  }
  const a = e.target.closest && e.target.closest("a");
  if (a && (e.ctrlKey || e.metaKey)) window.open(a.href, "_blank", "noopener");
});
editor.addEventListener("keydown", (e) => {
  if (e.key === "Enter") setTimeout(() => {
    const s = getSelection();
    const el = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
    const li = el && el.closest("li");
    if (li) li.classList.remove("done");
  }, 0);
});

/* Collage en texte brut */
editor.addEventListener("paste", (e) => {
  e.preventDefault();
  const t = (e.clipboardData || window.clipboardData).getData("text/plain");
  document.execCommand("insertText", false, t);
});

/* Tableaux */
$("tableCancel").onclick = () => tableDlg.close();
$("tableForm").onsubmit = () => {
  const rows = Math.min(30, Math.max(1, +$("tRows").value || 3));
  const cols = Math.min(10, Math.max(1, +$("tCols").value || 3));
  const head = $("tHead").checked;
  let html = "<table><tbody>";
  for (let r = 0; r < rows; r++) {
    html += "<tr>";
    for (let c = 0; c < cols; c++) html += (head && r === 0 ? "<th><br></th>" : "<td><br></td>");
    html += "</tr>";
  }
  html += "</tbody></table><p><br></p>";
  setTimeout(() => exec("insertHTML", html), 0);
};
$("tableBar").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tbl]");
  if (!b) return;
  const cell = closestEl("td,th");
  if (!cell) return;
  const tr = cell.parentElement, table = cell.closest("table"), idx = cell.cellIndex;
  switch (b.dataset.tbl) {
    case "addRow": {
      const nr = table.insertRow(tr.rowIndex + 1);
      for (let i = 0; i < tr.cells.length; i++) nr.insertCell().innerHTML = "<br>";
      break;
    }
    case "addCol":
      for (const row of table.rows) row.insertCell(Math.min(idx + 1, row.cells.length)).innerHTML = "<br>";
      break;
    case "delRow":
      tr.remove();
      if (!table.rows.length) table.remove();
      break;
    case "delCol":
      for (const row of table.rows) if (row.cells[idx]) row.cells[idx].remove();
      if (!table.rows[0] || !table.rows[0].cells.length) table.remove();
      break;
    case "delTable":
      table.remove();
      break;
  }
  $("tableBar").hidden = true;
  scheduleSave();
});

addEventListener("tc:before-signout", flush);

for (const d of document.querySelectorAll("dialog")) {
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
}

