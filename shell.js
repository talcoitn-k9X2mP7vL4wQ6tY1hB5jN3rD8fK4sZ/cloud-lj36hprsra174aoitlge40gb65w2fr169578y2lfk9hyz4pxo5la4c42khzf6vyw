import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { $ } from "./util.js";
import { bindCloud, unbindCloud } from "./settings.js";
import { initProfile, clearProfile, me, paintAvatar } from "./profile.js";
import "./pwa.js";

const TABS = ["personal", "community", "settings"];
const loaders = {
  community: () => import("./community.js"),
  settings: () => import("./settingsui.js")
};
const mods = {};
const load = (n) => mods[n] || (mods[n] = loaders[n]());

/* Onglets */
function show(tab) {
  if (!TABS.includes(tab)) tab = "personal";
  document.body.dataset.tab = tab;
  $("community").hidden = tab !== "community";
  $("settingsView").hidden = tab !== "settings";
  for (const b of $("dock").querySelectorAll("[data-tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
  $("dock").style.setProperty("--i", TABS.indexOf(tab));
  try { localStorage.setItem("tc-tab", tab); } catch {}
  if (tab === "community") load("community").then((m) => m.start());
  if (tab === "settings") load("settings").then((m) => m.render());
}
const dock = $("dock");
const slot = () => { const r = dock.getBoundingClientRect(); return { left: r.left + 6, w: (r.width - 12) / 3 }; };
const idxAt = (x) => { const s = slot(); return Math.max(0, Math.min(2, Math.floor((x - s.left) / s.w))); };
const mark = (i) => [...dock.querySelectorAll("[data-tab]")].forEach((b, k) => b.classList.toggle("hot", k === i));
let drag = null;
dock.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button) return;
  drag = { id: e.pointerId, x0: e.clientX, moved: false };
});
dock.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved) {
    if (Math.abs(e.clientX - drag.x0) < 6) return;
    drag.moved = true;
    dock.setPointerCapture(e.pointerId);
    dock.classList.add("drag");
    if (navigator.vibrate) navigator.vibrate(8);
  }
  const s = slot();
  const f = Math.max(0, Math.min(2, (e.clientX - s.left) / s.w - 0.5));
  dock.style.setProperty("--i", f);
  const n = Math.round(f);
  if (!dock.querySelector(".hot") || !dock.children[n + 1].classList.contains("hot")) { mark(n); if (navigator.vibrate) navigator.vibrate(4); }
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  dock.classList.remove("drag"); mark(-1);
  if (e.type === "pointercancel" && !d.moved) return;
  show(TABS[d.moved ? Math.round(parseFloat(dock.style.getPropertyValue("--i"))) : idxAt(e.clientX)]);
};
dock.addEventListener("pointerup", endDrag);
dock.addEventListener("pointercancel", endDrag);
dock.addEventListener("click", (e) => {            // clavier (Entrée / Espace)
  const b = e.target.closest("[data-tab]");
  if (b && e.detail === 0) show(b.dataset.tab);
});
$("dock").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const i = TABS.indexOf(document.body.dataset.tab) + (e.key === "ArrowRight" ? 1 : -1);
  show(TABS[(i + TABS.length) % TABS.length]);
  $("dock").querySelector('[aria-selected="true"]').focus();
});

/* Photo de profil sur l'icône Settings */
function dockAvatar() {
  const i = $("tabSettings").querySelector(".dav");
  i.hidden = !me.photo;
  $("tabSettings").classList.toggle("has-photo", !!me.photo);
  if (me.photo) paintAvatar(i, { photo: me.photo });
}
addEventListener("tc:profile", dockAvatar);

onAuthStateChanged(auth, async (user) => {
  $("dock").hidden = !user;
  if (user) {
    let tab = "personal";
    try { tab = localStorage.getItem("tc-tab") || "personal"; } catch {}
    show(tab);
    await Promise.all([bindCloud(user.uid), initProfile(user)]);
    (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => { load("community"); load("settings"); });
  } else {
    unbindCloud(); clearProfile();
    if (mods.community) mods.community.then((m) => m.stop());
    $("community").hidden = true; $("settingsView").hidden = true;
    document.body.dataset.tab = "personal";
  }
});
