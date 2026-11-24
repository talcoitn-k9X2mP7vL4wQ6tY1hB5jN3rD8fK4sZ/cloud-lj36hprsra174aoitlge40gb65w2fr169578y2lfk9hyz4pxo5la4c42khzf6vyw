import { db } from "./firebase.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

export const FONTS = [
  ["Nunito", "'Nunito', sans-serif"],
  ["Lora", "'Lora', serif"],
  ["Caveat", "'Caveat', cursive"],
  ["Arial", "Arial, sans-serif"],
  ["Trebuchet MS", "'Trebuchet MS', sans-serif"],
  ["Courier New", "'Courier New', monospace"]
];
export const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
export const ACCENTS = ["#1f9d7a", "#2b7de9", "#8a5cf6", "#e5568c", "#f08a24", "#14202b"];
export const DEFAULTS = {
  theme: "auto", accent: "#1f9d7a", font: FONTS[0][1], size: 17,
  glass: 0.55,   // opacité des surfaces (1 = plein, 0.1 = très transparent)
  blur: 24,      // px
  dim: 0.12,     // assombrissement du fond d'écran
  radius: 26,    // px
  dockBlur: 30,  // flou de la barre du bas (px)
  dockGlass: 0.45, // opacité de la barre du bas
  listSide: "left", // liste des notes / sujets sur ordinateur : left | right
  wallMode: "auto"
};
const LOCAL_ONLY = ["wallMode"];
const KEY = "tc-settings";

export let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || localStorage.getItem("notes-settings") || "{}") }; } catch {}
let customWall = "";
try { customWall = localStorage.getItem("tc-wall") || ""; } catch {}

export const getCustomWall = () => customWall;
export function setCustomWall(dataUrl) {
  try {
    if (dataUrl) localStorage.setItem("tc-wall", dataUrl); else localStorage.removeItem("tc-wall");
  } catch { return false; }
  customWall = dataUrl || "";
  settings.wallMode = dataUrl ? "custom" : "auto";
  saveSettings();
  return true;
}

export function applySettings() {
  const r = document.documentElement, s = settings;
  r.dataset.theme = s.theme;
  r.style.setProperty("--accent", s.accent);
  r.style.setProperty("--ef", s.font);
  r.style.setProperty("--es", s.size + "px");
  r.style.setProperty("--glass", s.glass);
  r.style.setProperty("--blur", s.blur + "px");
  r.style.setProperty("--dim", s.dim);
  r.style.setProperty("--r", s.radius + "px");
  r.style.setProperty("--dock-blur", s.dockBlur + "px");
  r.style.setProperty("--dock-alpha", s.dockGlass);
  r.dataset.side = s.listSide === "right" ? "right" : "left";
  if (s.wallMode === "custom" && customWall) r.style.setProperty("--wall-img", `url("${customWall}")`);
  else r.style.removeProperty("--wall-img");
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = s.accent;
}

let uid = null, timer = null;
const cloudPart = () => { const o = { ...settings }; LOCAL_ONLY.forEach((k) => delete o[k]); return o; };
async function pushCloud() { try { await update(ref(db, `users/${uid}/settings`), cloudPart()); } catch {} }

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  applySettings();
  if (uid) { clearTimeout(timer); timer = setTimeout(pushCloud, 900); }
}

export async function bindCloud(id) {
  uid = id;
  try {
    const v = (await get(ref(db, `users/${id}/settings`))).val();
    if (v) {
      Object.assign(settings, v);
      try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
      applySettings();
      window.dispatchEvent(new Event("tc:settings"));
    } else pushCloud();
  } catch {}
}
export function unbindCloud() { uid = null; clearTimeout(timer); }

applySettings();
