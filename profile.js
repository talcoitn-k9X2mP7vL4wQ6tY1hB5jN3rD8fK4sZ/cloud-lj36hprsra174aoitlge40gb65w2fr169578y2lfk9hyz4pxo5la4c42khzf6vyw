import { db } from "./firebase.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

export const me = { uid: null, name: "", photo: "", email: "" };
const cache = new Map();

export function getProfile(uid, force = false) {
  if (!force && cache.has(uid)) return cache.get(uid);
  const p = get(ref(db, `profiles/${uid}`)).then((s) => s.val() || {}).catch(() => ({}));
  cache.set(uid, p);
  return p;
}

export async function initProfile(user) {
  me.uid = user.uid; me.email = user.email || "";
  let p = await getProfile(user.uid, true);
  if (!p.name) {
    const name = /\.talco\.invalid$/.test(user.email || "") ? "Membre" : ((user.email || "Membre").split("@")[0].slice(0, 30) || "Membre");
    try { await update(ref(db, `profiles/${user.uid}`), { name }); } catch {}
    p = { ...p, name };
    cache.set(user.uid, Promise.resolve(p));
  }
  me.name = p.name; me.photo = p.photo || "";
  window.dispatchEvent(new Event("tc:profile"));
}

export async function saveProfile(patch) {
  const clean = { ...patch };
  for (const k of Object.keys(clean)) if (clean[k] === "") clean[k] = null;
  await update(ref(db, `profiles/${me.uid}`), clean);
  Object.assign(me, patch);
  cache.set(me.uid, Promise.resolve({ name: me.name, photo: me.photo }));
  window.dispatchEvent(new Event("tc:profile"));
}

export function clearProfile() { me.uid = null; me.name = me.photo = me.email = ""; cache.clear(); }

/* Remplit un rond d'avatar : photo si elle existe, sinon l'initiale */
export function paintAvatar(node, p, fallback = "?") {
  if (p && p.photo) {
    node.style.backgroundImage = `url("${p.photo}")`;
    node.textContent = "";
    node.classList.add("photo");
  } else {
    node.style.backgroundImage = "";
    node.classList.remove("photo");
    node.textContent = ((p && p.name) || fallback || "?").trim().charAt(0).toUpperCase() || "?";
  }
}
