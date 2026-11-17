"use strict";
// Giriş formu: parolayı yalnızca kendi sunucumuza, JSON gövdesinde gönderir.
(function () {
  var form = document.getElementById("giris-formu");
  var alan = document.getElementById("parola");
  var hata = document.getElementById("giris-hata");
  var dugme = form.querySelector("button");
  form.addEventListener("submit", function (olay) {
    olay.preventDefault();
    if (!alan.value) { goster("Parolayı yazın."); return; }
    dugme.disabled = true;
    fetch("/api/giris", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ parola: alan.value }) })
      .then(function (y) { return y.json().catch(function () { return {}; }).then(function (v) { return { durum: y.status, veri: v }; }); })
      .then(function (s) {
        if (s.durum === 200) { location.replace("/"); return; }
        alan.value = "";
        goster(s.veri.hata || "Giriş yapılamadı.");
      })
      .catch(function () { goster("Sunucuya ulaşılamadı."); })
      .finally(function () { dugme.disabled = false; });
  });
  function goster(metin) { hata.textContent = metin; hata.hidden = false; alan.focus(); }
})();
