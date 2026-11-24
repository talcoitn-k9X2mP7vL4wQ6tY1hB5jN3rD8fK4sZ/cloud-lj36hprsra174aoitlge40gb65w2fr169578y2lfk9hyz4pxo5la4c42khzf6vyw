import { auth, post } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { $, toast, resizeImage } from "./util.js";
import { settings, saveSettings, DEFAULTS, FONTS, SIZES, ACCENTS, setCustomWall, getCustomWall } from "./settings.js";
import { me, saveProfile, paintAvatar } from "./profile.js";

let built = false;

const slider = (id, label, min, max, unit = "") =>
  `<div class="srow"><div class="shead"><label for="${id}">${label}</label><b id="${id}V"></b></div><input type="range" id="${id}" min="${min}" max="${max}" step="1"></div>`;

function build() {
  built = true;
  $("settingsView").innerHTML = `
  <div class="sv-wrap">
    <h1>Settings</h1>

    <section class="gcard">
      <h3>Profil</h3>
      <div class="prof">
        <span class="avatar big" id="sAvatar"></span>
        <div class="prof-actions">
          <button class="btn primary sm" id="sPhoto" type="button">Changer la photo</button>
          <button class="btn ghost sm" id="sPhotoDel" type="button">Retirer</button>
          <input type="file" id="sFile" accept="image/*" hidden>
        </div>
      </div>
      <div class="field"><label for="sName">Nom affiché dans la Community</label>
        <input id="sName" class="textin" maxlength="30" placeholder="Ton pseudo"></div>
      <p class="muted" id="sMail"></p>
    </section>

    <section class="gcard">
      <h3>Apparence</h3>
      <div class="field"><label for="sTheme">Thème</label>
        <select id="sTheme" class="sel wide"><option value="auto">Automatique</option><option value="light">Clair</option><option value="dark">Sombre</option></select></div>
      <div class="field"><label>Couleur principale</label>
        <div class="swatches" id="sAccents"></div></div>
      <div class="field"><label>Liste des notes et des sujets (ordinateur)</label>
        <div class="seg" role="radiogroup"><button type="button" id="sideL" role="radio">À gauche</button><button type="button" id="sideR" role="radio">À droite</button></div></div>
    </section>

    <section class="gcard">
      <h3>Effet verre</h3>
      ${slider("sGlass", "Transparence du verre", 0, 90)}
      ${slider("sBlur", "Intensité du flou", 0, 60)}
      ${slider("sRadius", "Arrondis", 8, 40)}
      ${slider("sDockGlass", "Transparence de la barre du bas", 0, 90)}
      ${slider("sDockBlur", "Flou de la barre du bas", 0, 60)}
    </section>

    <section class="gcard">
      <h3>Fond d’écran</h3>
      <div class="seg" role="radiogroup" aria-label="Fond d’écran">
        <button type="button" id="sWallAuto" role="radio">Auto (selon l’écran)</button>
        <button type="button" id="sWallCustom" role="radio">Ma photo</button>
      </div>
      <div class="prof-actions"><button class="btn ghost sm" id="sWallPick" type="button">Choisir une photo</button>
        <input type="file" id="sWallFile" accept="image/*" hidden></div>
      ${slider("sDim", "Assombrir le fond", 0, 70)}
    </section>

    <section class="gcard">
      <h3>Notes</h3>
      <div class="field"><label for="sFont">Police par défaut</label><select id="sFont" class="sel wide"></select></div>
      ${slider("sSize", "Taille du texte", 13, 28)}
    </section>

    <section class="gcard">
      <h3>Application</h3>
      <div class="prof-actions">
        <button class="btn primary sm" data-install type="button">⬇ Installer l’application</button>
        <button class="btn ghost sm" id="sReset" type="button">Réinitialiser l’apparence</button>
        <button class="btn danger sm" id="sOut" type="button">Se déconnecter</button>
      </div>
    </section>
  </div>`;

  FONTS.forEach(([n, v]) => { const o = document.createElement("option"); o.value = v; o.textContent = n; $("sFont").append(o); });
  ACCENTS.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button"; b.style.setProperty("--c", c); b.setAttribute("aria-label", "Couleur " + c);
    b.onclick = () => { settings.accent = c; saveSettings(); refresh(); };
    $("sAccents").append(b);
  });
  const pick = document.createElement("label");
  pick.className = "pick"; pick.title = "Couleur personnalisée";
  pick.innerHTML = '<input type="color" id="sAccentCustom" aria-label="Couleur personnalisée">+';
  $("sAccents").append(pick);
  $("sAccentCustom").oninput = (e) => { settings.accent = e.target.value; saveSettings(); refresh(); };

  $("sTheme").onchange = (e) => { settings.theme = e.target.value; saveSettings(); };
  $("sFont").onchange = (e) => { settings.font = e.target.value; saveSettings(); };
  const bind = (id, key, fn) => $(id).addEventListener("input", (e) => { settings[key] = fn(+e.target.value); saveSettings(); refresh(true); });
  bind("sGlass", "glass", (v) => +(1 - v / 100).toFixed(2));
  bind("sBlur", "blur", (v) => v);
  bind("sRadius", "radius", (v) => v);
  bind("sDim", "dim", (v) => v / 100);
  bind("sDockGlass", "dockGlass", (v) => +(1 - v / 100).toFixed(2));
  bind("sDockBlur", "dockBlur", (v) => v);
  $("sideL").onclick = () => { settings.listSide = "left"; saveSettings(); refresh(); };
  $("sideR").onclick = () => { settings.listSide = "right"; saveSettings(); refresh(); };
  bind("sSize", "size", (v) => v);

  $("sWallAuto").onclick = () => { settings.wallMode = "auto"; saveSettings(); refresh(); };
  $("sWallCustom").onclick = () => {
    if (getCustomWall()) { settings.wallMode = "custom"; saveSettings(); refresh(); } else $("sWallFile").click();
  };
  $("sWallPick").onclick = () => $("sWallFile").click();
  $("sWallFile").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const d = await resizeImage(f, { max: 1920, quality: 0.8 });
      if (!setCustomWall(d)) toast("Image trop lourde pour être gardée sur cet appareil.");
      refresh();
    } catch { toast("Image illisible."); }
  };

  $("sPhoto").onclick = () => $("sFile").click();
  $("sFile").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      let d = "";
      for (const q of [0.85, 0.7, 0.55]) { d = await resizeImage(f, { max: 256, quality: q, square: true }); if (d.length < 55000) break; }
      await saveProfile({ photo: d });
      toast("Photo mise à jour.");
    } catch { toast("Impossible d’enregistrer la photo."); }
  };
  $("sPhotoDel").onclick = async () => { try { await saveProfile({ photo: "" }); } catch { toast("Action impossible."); } };
  $("sName").onchange = async (e) => {
    const name = e.target.value.trim().slice(0, 30);
    if (!name) { e.target.value = me.name; return; }
    try { await saveProfile({ name }); toast("Nom enregistré."); } catch { toast("Impossible d’enregistrer le nom."); }
  };

  $("sReset").onclick = () => {
    for (const k of ["theme", "accent", "glass", "blur", "dim", "radius", "dockBlur", "dockGlass", "listSide", "wallMode"]) settings[k] = DEFAULTS[k];
    saveSettings(); refresh();
  };
  $("sOut").onclick = async () => { dispatchEvent(new Event("tc:before-signout")); post({ type: "talco-logout" }); await signOut(auth); };
  addEventListener("tc:profile", paintProfile);
  addEventListener("tc:settings", () => refresh());
}

function paintProfile() {
  if (!built) return;
  paintAvatar($("sAvatar"), { name: me.name, photo: me.photo }, me.email);
  if (document.activeElement !== $("sName")) $("sName").value = me.name;
  $("sMail").textContent = "Compte TalcoITN";
  $("sPhotoDel").hidden = !me.photo;
}

function refresh(light = false) {
  $("sGlass").value = Math.round((1 - settings.glass) * 100); $("sGlassV").textContent = $("sGlass").value + " %";
  $("sBlur").value = settings.blur; $("sBlurV").textContent = settings.blur + " px";
  $("sRadius").value = settings.radius; $("sRadiusV").textContent = settings.radius + " px";
  $("sDim").value = Math.round(settings.dim * 100); $("sDimV").textContent = $("sDim").value + " %";
  $("sDockGlass").value = Math.round((1 - settings.dockGlass) * 100); $("sDockGlassV").textContent = $("sDockGlass").value + " %";
  $("sDockBlur").value = settings.dockBlur; $("sDockBlurV").textContent = settings.dockBlur + " px";
  $("sSize").value = settings.size; $("sSizeV").textContent = settings.size + " px";
  if (light) return;
  $("sideL").classList.toggle("on", settings.listSide !== "right"); $("sideR").classList.toggle("on", settings.listSide === "right");
  $("sideL").setAttribute("aria-checked", String(settings.listSide !== "right")); $("sideR").setAttribute("aria-checked", String(settings.listSide === "right"));
  $("sTheme").value = settings.theme;
  $("sFont").value = settings.font;
  $("sAccentCustom").value = /^#[0-9a-f]{6}$/i.test(settings.accent) ? settings.accent : "#1f9d7a";
  [...$("sAccents").querySelectorAll("button")].forEach((b, i) => b.classList.toggle("on", ACCENTS[i] === settings.accent));
  const custom = settings.wallMode === "custom" && !!getCustomWall();
  $("sWallAuto").setAttribute("aria-checked", String(!custom)); $("sWallCustom").setAttribute("aria-checked", String(custom));
  $("sWallAuto").classList.toggle("on", !custom); $("sWallCustom").classList.toggle("on", custom);
}

export function render() {
  if (!built) build();
  refresh();
  paintProfile();
}
