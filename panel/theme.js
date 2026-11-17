"use strict";
// Tema sayfa çizilmeden önce uygulanır (renk sıçraması olmasın). Seçim yapılmadıysa sistem ayarı izlenir;
// elle yapılan seçim bu cihazda saklanır.
(function () {
  var secim = null;
  try { var s = localStorage.getItem("radar.tema"); if (s === "dark" || s === "light") secim = s; } catch (e) { /* depolama kapalı */ }
  var sistem = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", secim || sistem);
})();
