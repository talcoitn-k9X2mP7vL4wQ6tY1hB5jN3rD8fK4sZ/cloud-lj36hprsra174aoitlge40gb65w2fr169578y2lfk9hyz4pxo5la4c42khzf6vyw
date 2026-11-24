export const $ = (id) => document.getElementById(id);

export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...kids);
  return e;
}

export function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts), n = new Date();
  if (d.toDateString() === n.toDateString()) return fmtClock(ts);
  if (d.toDateString() === new Date(n - 864e5).toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
export const fmtClock = (ts) => new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
export function fmtDay(ts) {
  const d = new Date(ts), n = new Date();
  if (d.toDateString() === n.toDateString()) return "Aujourd’hui";
  if (d.toDateString() === new Date(n - 864e5).toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function toast(msg, ms = 2800) {
  const t = el("div", { class: "toast", text: msg });
  $("toasts").append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 350); }, ms);
}

/* Redimensionne / recadre une image côté navigateur (rapide, hors thread principal pour le décodage) */
export async function resizeImage(file, { max = 1600, quality = 0.82, square = false } = {}) {
  const bmp = await createImageBitmap(file);
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height, w, h;
  if (square) {
    const s = Math.min(sw, sh);
    sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s;
    w = h = Math.min(max, s);
  } else {
    const k = Math.min(1, max / Math.max(sw, sh));
    w = Math.round(sw * k); h = Math.round(sh * k);
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return c.toDataURL("image/jpeg", quality);
}
