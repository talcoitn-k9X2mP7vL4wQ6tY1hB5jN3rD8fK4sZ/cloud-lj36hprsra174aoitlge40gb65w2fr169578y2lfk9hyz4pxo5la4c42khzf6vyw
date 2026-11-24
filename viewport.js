/* Clavier virtuel : l'appli suit la zone réellement visible (plus d'écran vide ni de page qui remonte). */
(function () {
  var vv = window.visualViewport, r = document.documentElement;
  var touch = matchMedia("(pointer: coarse)");
  var base = 0, baseW = 0, timer = 0, raf = 0;
  var isField = function (n) {
    return !!n && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT" || n.isContentEditable) && !(n.type === "range" || n.type === "color" || n.type === "checkbox" || n.type === "file");
  };
  function update() {
    raf = 0;
    var h = vv ? vv.height : innerHeight, top = vv ? vv.offsetTop : 0, w = innerWidth;
    if (w !== baseW) { baseW = w; base = 0; }
    base = Math.max(base, innerHeight, h);
    r.style.setProperty("--app-h", Math.round(h) + "px");
    r.style.setProperty("--vv-top", Math.round(top) + "px");
    var kb = touch.matches && (base - h > 120 || isField(document.activeElement));
    r.classList.toggle("kb", kb);
    if (window.scrollY || window.scrollX) scrollTo(0, 0);
    window.dispatchEvent(new Event("tc:vv"));
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(update); }
  if (vv) { vv.addEventListener("resize", schedule); vv.addEventListener("scroll", schedule); }
  addEventListener("resize", schedule);
  addEventListener("orientationchange", function () { base = 0; setTimeout(schedule, 300); });
  addEventListener("focusin", schedule);
  addEventListener("focusout", function () { clearTimeout(timer); timer = setTimeout(schedule, 120); });
  update();
})();
