import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

/* Cette interface ne s'ouvre que dans le login commun : sinon retour au login. */
const PARENT = "https://natlacaxi.github.io";
{ let ok = window.parent !== window; try { const ao = location.ancestorOrigins; if (ok && ao && ao.length) ok = ao[0] === PARENT; } catch (e) {}
  if (!ok) { location.replace(PARENT + "/cloud/"); throw new Error("hors cadre"); } }
export const post = (m) => { try { parent.postMessage(m, PARENT); } catch (e) {} };
/* Diagnostic : les erreurs de l'interface sont remontées au login (affichées si le service ne démarre pas). */
addEventListener("error", (e) => post({ type: "talco-error", message: String(e.message || e.error || "erreur") }));
addEventListener("unhandledrejection", (e) => post({ type: "talco-error", message: String((e.reason && (e.reason.message || e.reason.code)) || e.reason || "erreur") }));

export const app = initializeApp({
  apiKey: "AIzaSyBnD2qS2TLKvFRFTi5HxWMIo4CPXaQ3FVM",
  authDomain: "itn-4-4a63e.firebaseapp.com",
  databaseURL: "https://itn-4-4a63e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "itn-4-4a63e",
  storageBucket: "itn-4-4a63e.firebasestorage.app",
  messagingSenderId: "764157056750",
  appId: "1:764157056750:web:38fdbe924f9518273ec5ff"
});
export const auth = getAuth(app);
export const db = getDatabase(app);

/* Le login envoie l'identifiant interne du service ; la session est ensuite gardée ici. */
addEventListener("message", async (e) => {
  if (e.origin !== PARENT || e.source !== parent) return;
  const m = e.data || {};
  if (m.type === "talco-login" && typeof m.email === "string" && typeof m.password === "string") {
    try {
      if (auth.currentUser && auth.currentUser.email !== m.email) await signOut(auth);
      if (!auth.currentUser) await signInWithEmailAndPassword(auth, m.email, m.password);
    } catch (err) { post({ type: "talco-login-error" }); }
  }
});
