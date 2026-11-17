// Panel: takipler, takip formu, ayarlar ve durum ekranları. Sunucu tarafı işlem yoktur; veri kasadan gelir.
// Sayfaya yalnızca textContent ile yazılır (innerHTML kullanılmaz); satır içi betik ve stil yoktur (CSP).
import { dogrula, ozet, varsayilanTakip, sorguYuku, bugunTR, gunEkle, SINIR, TUR_ADI, TURLER, KANALLAR, KANAL_ADI } from "./ortak/kurallar.js";

const icerik = document.getElementById("icerik");
const TASLAK = "radar.taslak";
const AY_ADI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_ADI = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const ULKE_ADI = { TR: "Türkiye", CY: "Kıbrıs", DE: "Almanya", NL: "Hollanda", GB: "Birleşik Krallık", FR: "Fransa", IT: "İtalya", ES: "İspanya", PT: "Portekiz",
  AT: "Avusturya", CH: "İsviçre", BE: "Belçika", DK: "Danimarka", SE: "İsveç", NO: "Norveç", FI: "Finlandiya", IE: "İrlanda", PL: "Polonya", CZ: "Çekya",
  HU: "Macaristan", RO: "Romanya", BG: "Bulgaristan", GR: "Yunanistan", RS: "Sırbistan", BA: "Bosna-Hersek", MK: "Kuzey Makedonya", XK: "Kosova", AL: "Arnavutluk",
  GE: "Gürcistan", AZ: "Azerbaycan", AE: "BAE", QA: "Katar", SA: "Suudi Arabistan", EG: "Mısır", IL: "İsrail", LB: "Lübnan", JO: "Ürdün", IQ: "Irak", IR: "İran",
  RU: "Rusya", KZ: "Kazakistan", UZ: "Özbekistan", US: "ABD" };
const DURUM_ADI = { etkin: "Etkin", duraklatildi: "Duraklatıldı", "suresi-doldu": "Süresi doldu" };
const KAPSAM_ADI = { havalimani: "Belirli havalimanları", "yurt-ici": "Yurt içi", "yurt-disi": "Yurt dışı", ulke: "Ülkeler", "her-yer": "Her yer" };

const durum = { sabit: null, ayarlar: null, havalimani: new Map(), havayolu: new Map() };

// ------------------------------------------------------------------ yardımcılar

function el(etiket, ozellik = {}, ...cocuklar) {
  const d = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellik)) {
    if (v === false || v == null) continue;
    if (k === "class") d.className = v;
    else if (k.startsWith("on")) d.addEventListener(k.slice(2), v);
    else if (k === "checked" || k === "disabled" || k === "value" || k === "hidden") d[k] = v;
    else d.setAttribute(k, v === true ? "" : v);
  }
  for (const c of cocuklar.flat()) if (c != null && c !== false) d.append(c);
  return d;
}

async function api(yol, { yontem = "GET", govde } = {}) {
  let y;
  try {
    y = await fetch(yol, { method: yontem, credentials: "same-origin", headers: govde ? { "content-type": "application/json" } : {}, body: govde ? JSON.stringify(govde) : undefined });
  } catch { throw Object.assign(new Error("Sunucuya ulaşılamadı."), { durum: 0 }); }
  if (y.status === 401) { location.replace("/giris"); throw Object.assign(new Error("Giriş gerekli."), { durum: 401 }); }
  const veri = await y.json().catch(() => ({}));
  if (!y.ok) throw Object.assign(new Error(veri.hata || "İşlem yapılamadı."), { durum: y.status, hatalar: veri.hatalar || {} });
  return veri;
}

const tl = (n) => (n == null ? "–" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n) + " TL");
const zaman = (iso) => (iso ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "henüz yok");
const kopya = (x) => JSON.parse(JSON.stringify(x));
const baglam = () => ({ havalimanlari: durum.havalimani, havayollari: durum.havayolu, bugun: bugunTR(), kanallar: durum.ayarlar.kurulu_kanallar || KANALLAR });

function goster(...dugumler) { icerik.replaceChildren(...dugumler.flat().filter((d) => d != null && d !== false)); window.scrollTo(0, 0); }
function hataGoster(e) { goster(el("p", { class: "uyari", role: "alert" }, e.message), el("a", { class: "dugme", href: "#takipler" }, "Takiplere dön")); }

// ------------------------------------------------------------------ takipler ekranı

function rotaOzeti(t) {
  if (t.tur === "kampanya") return t.kalkis.length ? `${t.kalkis.join(", ")} kalkışlı kampanyalar` : "Tüm kampanyalar";
  const v = t.varis.kapsam === "havalimani" ? t.varis.havalimanlari.join(", ") : t.varis.kapsam === "ulke" ? t.varis.ulkeler.map((u) => ULKE_ADI[u] || u).join(", ") : KAPSAM_ADI[t.varis.kapsam].toLocaleLowerCase("tr");
  return `${t.kalkis.join(", ")} → ${v} · ${t.yon === "gidis-donus" ? "gidiş-dönüş" : "tek yön"}`;
}

function tarihOzeti(t) {
  if (t.tur === "kampanya") return "Tarih yok";
  const tr = t.tarih;
  const gun = (s) => { const [, m, g] = s.split("-").map(Number); return `${g} ${AY_ADI[m - 1].slice(0, 3)}`; };
  if (tr.bicim === "aralik") return `${gun(tr.baslangic)} – ${gun(tr.bitis)}`;
  if (tr.bicim === "aylar") return tr.aylar.map((a) => AY_ADI[Number(a.slice(5)) - 1]).join(", ");
  return `Sürekli, ${tr.pencere} gün`;
}

async function takiplerEkrani() {
  const { takipler } = await api("/api/takipler");
  const kartlar = takipler.map((t) => {
    const eylem = async (yol, yontem = "POST") => { try { await api(yol, { yontem, govde: yontem === "DELETE" ? undefined : {} }); await takiplerEkrani(); } catch (e) { hataGoster(e); } };
    return el("article", { class: "kart", "data-kimlik": t.kimlik },
      el("div", { class: "kart-ust" }, el("h3", {}, t.ad), el("span", { class: "rozet " + t.durum }, DURUM_ADI[t.durum] || t.durum)),
      el("p", { class: "ozet-satiri" }, `${TUR_ADI[t.tur]} · ${rotaOzeti(t)}`),
      el("p", { class: "ozet-satiri" }, tarihOzeti(t) + (t.tetikler?.esik?.acik ? ` · eşik ${tl(t.tetikler.esik.tutar)}` : "")),
      el("div", { class: "olcumler" },
        el("span", {}, "Son fiyat ", el("b", {}, tl(t.sonFiyat))),
        el("span", {}, "Son tarama ", el("b", {}, zaman(t.sonTarama))),
        el("span", {}, "Sorgu/tur ", el("b", {}, String(t.sorguYuku)))),
      el("div", { class: "kart-eylemler" },
        el("a", { class: "dugme kucuk", href: `#duzenle/${t.kimlik}` }, "Düzenle"),
        t.durum === "etkin" && el("button", { class: "dugme kucuk", type: "button", onclick: () => eylem(`/api/takipler/${t.kimlik}/duraklat`) }, "Duraklat"),
        t.durum === "duraklatildi" && el("button", { class: "dugme kucuk", type: "button", onclick: () => eylem(`/api/takipler/${t.kimlik}/surdur`) }, "Sürdür"),
        el("button", { class: "dugme kucuk", type: "button", onclick: () => eylem(`/api/takipler/${t.kimlik}/cogalt`) }, "Çoğalt"),
        el("button", { class: "dugme kucuk tehlike", type: "button", onclick: (o) => {
          const d = o.currentTarget;
          if (d.dataset.onay) eylem(`/api/takipler/${t.kimlik}`, "DELETE"); else { d.dataset.onay = "1"; d.textContent = "Silmek için yeniden dokunun"; }
        } }, "Sil")));
  });
  goster(
    el("div", { class: "baslik-satiri" }, el("h1", {}, "Takipler"), el("a", { class: "dugme birincil", href: "#yeni" }, "Yeni takip")),
    takipler.length ? kartlar : el("p", { class: "bilgi" }, "Henüz takip yok. İlk takibi eklemek için \"Yeni takip\"e dokunun."));
}

// ------------------------------------------------------------------ takip formu

function formEkrani(ilk, kimlik) {
  const f = kopya(ilk);
  f.donus ??= varsayilanTakip().donus;
  f.saat ??= { bas: "", bit: "" };
  let hatalar = {}, denendi = false, arama = { kalkis: "", varis: "" };
  const yeni = !kimlik;
  const taslakYaz = () => { if (yeni) try { localStorage.setItem(TASLAK, JSON.stringify(f)); } catch { /* depolama kapalı */ } };

  const alan = (anahtar, etiket, ...govde) => el("div", { class: "alan" + (hatalar[anahtar] ? " hatali" : ""), "data-alan": anahtar },
    el("span", { class: "etiket" }, etiket), ...govde, hatalar[anahtar] && el("p", { class: "hata-metni", role: "alert" }, hatalar[anahtar]));
  const secim = (ad, tur, secenekler, secili, degis) => el("div", { class: "secenekler", role: tur === "radio" ? "radiogroup" : "group" },
    secenekler.map(([deger, yazi, kapali]) => el("label", { class: "secenek" },
      el("input", { type: tur, name: ad, value: deger, checked: tur === "radio" ? secili === deger : secili.includes(deger), disabled: kapali,
        onchange: (o) => degis(deger, o.currentTarget.checked) }), el("span", {}, yazi))));
  const sayi = (deger, degis, ek = {}) => el("input", { type: "number", inputmode: "numeric", value: deger ?? "", ...ek,
    oninput: (o) => { degis(o.currentTarget.value === "" ? "" : Number(o.currentTarget.value)); guncelle(); } });
  const tarihGirdisi = (deger, degis, ek = {}) => el("input", { type: "date", value: deger || "", min: bugunTR(), max: gunEkle(bugunTR(), SINIR.ileriGun + 60), ...ek,
    onchange: (o) => { degis(o.currentTarget.value); guncelle(); } });

  function havalimaniSecici(anahtar, liste, enCok, haric = []) {
    const sonuclar = el("div", { class: "sonuclar" });
    const doldur = () => {
      const q = arama[anahtar].trim().toLocaleLowerCase("tr");
      const bulunan = q.length < 2 ? [] : [...durum.havalimani.values()].filter((h) => !liste.includes(h.kod) && !haric.includes(h.kod) &&
        `${h.kod} ${h.ad} ${h.sehir}`.toLocaleLowerCase("tr").includes(q)).slice(0, 8);
      sonuclar.replaceChildren(...bulunan.map((h) => el("button", { type: "button", onclick: () => {
        if (liste.length >= enCok) return;
        liste.push(h.kod); arama[anahtar] = ""; ciz();
      } }, el("span", {}, `${h.ad}, ${h.sehir}`), el("b", {}, h.kod))));
    };
    const kutu = el("div", {},
      el("div", { class: "etiketler" }, liste.map((k) => el("span", { class: "cip" }, `${k} · ${durum.havalimani.get(k)?.ad || ""}`,
        el("button", { type: "button", "aria-label": `${k} kaldır`, onclick: () => { liste.splice(liste.indexOf(k), 1); ciz(); } }, "×")))),
      liste.length < enCok && el("input", { type: "search", placeholder: "Havalimanı ya da şehir ara (ör. Erzurum, SAW)", value: arama[anahtar], autocomplete: "off",
        "aria-label": "Havalimanı ara", oninput: (o) => { arama[anahtar] = o.currentTarget.value; doldur(); } }),
      sonuclar);
    doldur();
    return kutu;
  }

  function guncelle() {
    taslakYaz();
    const kutu = icerik.querySelector("#ozet");
    if (!kutu) return;
    const s = dogrula(f, baglam());
    if (s.tamam) {
      kutu.className = "ozet-kutusu";
      kutu.replaceChildren(el("h3", {}, "Bu takip şunu izleyecek"), el("p", {}, ozet(s.takip, durum.havalimani, bugunTR())));
    } else {
      kutu.className = "ozet-kutusu hatali";
      kutu.replaceChildren(el("h3", {}, "Eksik ya da hatalı alanlar"), el("ul", {}, Object.values(s.hatalar).map((m) => el("li", {}, m))));
    }
  }

  async function kaydet(o) {
    o.preventDefault();
    denendi = true;
    const s = dogrula(f, baglam());
    hatalar = s.hatalar;
    if (!s.tamam) { ciz(); icerik.querySelector(".hatali")?.scrollIntoView({ block: "center" }); return; }
    const dugme = icerik.querySelector("#kaydet");
    dugme.disabled = true;
    try {
      await api(yeni ? "/api/takipler" : `/api/takipler/${kimlik}`, { yontem: yeni ? "POST" : "PUT", govde: f });
      if (yeni) try { localStorage.removeItem(TASLAK); } catch { /* depolama kapalı */ }
      location.hash = "#takipler";
    } catch (e) {
      hatalar = { ...e.hatalar, genel: Object.keys(e.hatalar || {}).length ? null : e.message };
      ciz();
    }
  }

  function ciz() {
    if (denendi) hatalar = { ...dogrula(f, baglam()).hatalar, genel: hatalar.genel };
    const kampanya = f.tur === "kampanya";
    const gd = f.tur === "gidis-donus" || f.yon === "gidis-donus";
    const kurulu = durum.ayarlar.kurulu_kanallar || KANALLAR;
    const bugun = bugunTR();
    const aylar = Array.from({ length: 11 }, (_, i) => { const d = new Date(bugun.slice(0, 7) + "-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + i); return d.toISOString().slice(0, 7); });
    const ulkeler = [...new Set([...durum.havalimani.values()].map((h) => h.ulke))].sort((a, b) => (ULKE_ADI[a] || a).localeCompare(ULKE_ADI[b] || b, "tr"));
    const tetik = (anahtar, yazi, ek) => el("div", { class: "onay" },
      el("input", { type: "checkbox", id: "t-" + anahtar, checked: f.tetikler[anahtar].acik, onchange: (o) => { f.tetikler[anahtar].acik = o.currentTarget.checked; ciz(); } }),
      el("div", { class: "govde" }, el("label", { for: "t-" + anahtar }, yazi), f.tetikler[anahtar].acik && ek,
        hatalar[anahtar] && el("p", { class: "hata-metni", role: "alert" }, hatalar[anahtar])));

    goster(
      el("div", { class: "baslik-satiri" }, el("h1", {}, yeni ? "Yeni takip" : "Takibi düzenle")),
      hatalar.genel && el("p", { class: "uyari", role: "alert" }, hatalar.genel),
      el("form", { novalidate: true, onsubmit: kaydet },
        el("section", { class: "bolum" }, el("h3", {}, "Ne izlenecek"),
          alan("tur", "Tür", secim("tur", "radio", TURLER.map((t) => [t, TUR_ADI[t]]), f.tur, (d) => {
            f.tur = d;
            if (d === "gidis-donus") f.yon = "gidis-donus";
            if (["rota", "gidis-donus"].includes(d)) f.varis.kapsam = "havalimani";
            ciz();
          })),
          alan("ad", "Ad", el("input", { type: "text", maxlength: 60, value: f.ad, placeholder: "Boş bırakılırsa rotadan türetilir",
            oninput: (o) => { f.ad = o.currentTarget.value; guncelle(); } })),
          alan("kalkis", kampanya ? "Kalkış havalimanları (isteğe bağlı süzgeç)" : "Kalkış havalimanları",
            havalimaniSecici("kalkis", f.kalkis, SINIR.kalkis, f.varis.havalimanlari),
            el("div", { class: "kart-eylemler" }, el("button", { class: "dugme kucuk", type: "button", onclick: () => {
              for (const k of ["IST", "SAW"]) if (!f.kalkis.includes(k) && f.kalkis.length < SINIR.kalkis) f.kalkis.push(k);
              ciz();
            } }, "İstanbul (IST + SAW)")),
            el("p", { class: "ipucu" }, `En fazla ${SINIR.kalkis}. İstanbul için IST ve SAW ayrı havalimanlarıdır.`)),
          !kampanya && alan("varis", "Varış",
            el("select", { "aria-label": "Varış kapsamı", onchange: (o) => { f.varis.kapsam = o.currentTarget.value; ciz(); } },
              Object.entries(KAPSAM_ADI).filter(([k]) => k === "havalimani" || !["rota", "gidis-donus"].includes(f.tur))
                .map(([k, v]) => el("option", { value: k, selected: f.varis.kapsam === k }, v))),
            f.varis.kapsam === "havalimani" && havalimaniSecici("varis", f.varis.havalimanlari, SINIR.varis, f.kalkis),
            f.varis.kapsam === "ulke" && el("div", { class: "onay-listesi" }, ulkeler.map((u) => el("label", {},
              el("input", { type: "checkbox", checked: f.varis.ulkeler.includes(u), onchange: (o) => {
                f.varis.ulkeler = o.currentTarget.checked ? [...f.varis.ulkeler, u] : f.varis.ulkeler.filter((x) => x !== u); guncelle();
              } }), ULKE_ADI[u] || u)))),
          !kampanya && f.tur !== "gidis-donus" && alan("yon", "Yön", secim("yon", "radio", [["tek", "Tek yön"], ["gidis-donus", "Gidiş-dönüş"]], f.yon, (d) => { f.yon = d; ciz(); }))),

        !kampanya && el("section", { class: "bolum" }, el("h3", {}, "Ne zaman"),
          alan("tarih", "Gidiş tarihi",
            secim("bicim", "radio", [["surekli", "Sürekli"], ["aralik", "Aralık"], ["aylar", "Aylar"]], f.tarih.bicim, (d) => { f.tarih.bicim = d; ciz(); }),
            f.tarih.bicim === "aralik" && el("div", { class: "ikili ek-ust" },
              tarihGirdisi(f.tarih.baslangic, (v) => { f.tarih.baslangic = v; }, { "aria-label": "Gidiş başlangıcı" }),
              tarihGirdisi(f.tarih.bitis, (v) => { f.tarih.bitis = v; }, { "aria-label": "Gidiş bitişi" })),
            f.tarih.bicim === "aylar" && secim("ay", "checkbox", aylar.map((a) => [a, `${AY_ADI[Number(a.slice(5)) - 1].slice(0, 3)} ${a.slice(2, 4)}`]), f.tarih.aylar,
              (d, acik) => { f.tarih.aylar = acik ? [...f.tarih.aylar, d].sort() : f.tarih.aylar.filter((x) => x !== d); guncelle(); }),
            f.tarih.bicim === "surekli" && el("div", { class: "onay" }, el("div", { class: "govde" }, el("div", { class: "ek" },
              "Bugünden başlayarak", sayi(f.tarih.pencere, (v) => { f.tarih.pencere = v; }, { min: 7, max: SINIR.ileriGun, "aria-label": "Pencere (gün)" }), "gün")))),
          alan("gunler", "Haftanın günleri", secim("gun", "checkbox", GUN_ADI.map((g, i) => [i + 1, g]), f.tarih.gunler,
            (d, acik) => { f.tarih.gunler = acik ? [...f.tarih.gunler, d].sort() : f.tarih.gunler.filter((x) => x !== d); guncelle(); }),
            el("p", { class: "ipucu" }, "Hiçbiri seçilmezse her gün.")),
          gd && alan("donus", "Dönüş",
            secim("donus", "radio", [["kalis", "Kalış süresi"], ["aralik", "Tarih aralığı"]], f.donus.bicim, (d) => { f.donus.bicim = d; ciz(); }),
            f.donus.bicim === "aralik"
              ? el("div", { class: "ikili" }, tarihGirdisi(f.donus.baslangic, (v) => { f.donus.baslangic = v; }, { "aria-label": "Dönüş başlangıcı" }),
                  tarihGirdisi(f.donus.bitis, (v) => { f.donus.bitis = v; }, { "aria-label": "Dönüş bitişi" }))
              : el("div", { class: "ikili" }, sayi(f.donus.enAz, (v) => { f.donus.enAz = v; }, { min: 0, max: 60, "aria-label": "En az gece" }),
                  sayi(f.donus.enCok, (v) => { f.donus.enCok = v; }, { min: 0, max: 60, "aria-label": "En çok gece" })),
            f.donus.bicim === "kalis" && el("p", { class: "ipucu" }, "En az ve en çok gece sayısı."),
            el("label", { class: "onay" }, el("input", { type: "checkbox", checked: f.donus.farkliHavalimani, onchange: (o) => { f.donus.farkliHavalimani = o.currentTarget.checked; guncelle(); } }),
              el("span", { class: "govde" }, "Farklı havalimanına dönüş olabilir")))),

        !kampanya && el("section", { class: "bolum" }, el("h3", {}, "Süzgeçler"),
          el("div", { class: "ikili" },
            alan("yolcu", "Yolcu sayısı", sayi(f.yolcu, (v) => { f.yolcu = v; }, { min: 1, max: 9 })),
            alan("aktarma", "Aktarma", el("select", { onchange: (o) => { f.aktarma = o.currentTarget.value; guncelle(); } },
              [["farketmez", "Fark etmez"], ["aktarmasiz", "Aktarmasız"], ["en-fazla-1", "En fazla 1"]].map(([k, v]) => el("option", { value: k, selected: f.aktarma === k }, v))))),
          alan("havayolu", "Havayolu",
            el("select", { onchange: (o) => { f.havayolu.kip = o.currentTarget.value; ciz(); } },
              [["hepsi", "Hepsi"], ["dahil", "Yalnızca seçtiklerim"], ["haric", "Seçtiklerim hariç"]].map(([k, v]) => el("option", { value: k, selected: f.havayolu.kip === k }, v))),
            f.havayolu.kip !== "hepsi" && el("div", { class: "onay-listesi" }, [...durum.havayolu].map(([k, ad]) => el("label", {},
              el("input", { type: "checkbox", checked: f.havayolu.kodlar.includes(k), onchange: (o) => {
                f.havayolu.kodlar = o.currentTarget.checked ? [...f.havayolu.kodlar, k] : f.havayolu.kodlar.filter((x) => x !== k); guncelle();
              } }), ad)))),
          alan("saat", "Kalkış saati (isteğe bağlı)", el("div", { class: "ikili" },
            el("input", { type: "time", value: f.saat.bas, "aria-label": "En erken kalkış", onchange: (o) => { f.saat.bas = o.currentTarget.value; guncelle(); } }),
            el("input", { type: "time", value: f.saat.bit, "aria-label": "En geç kalkış", onchange: (o) => { f.saat.bit = o.currentTarget.value; guncelle(); } })),
            el("p", { class: "ipucu" }, "Kaynak uçuş saatini vermezse süzgeç uygulanmaz."))),

        !kampanya && el("section", { class: "bolum" + (hatalar.tetikler ? " hatali" : "") }, el("h3", {}, "Ne zaman haber versin"),
          tetik("esik", f.yon === "gidis-donus" || f.tur === "gidis-donus" ? "Kişi başı toplam fiyat şu tutarın altına inince" : "Fiyat şu tutarın altına inince",
            el("div", { class: "ek" }, sayi(f.tetikler.esik.tutar, (v) => { f.tetikler.esik.tutar = v; }, { min: 100, max: 100000, step: 50, "aria-label": "Eşik (TL)" }), "TL")),
          tetik("donemDusugu", "Dönemin en düşüğü görülünce",
            el("div", { class: "ek" }, "Son", sayi(f.tetikler.donemDusugu.gun, (v) => { f.tetikler.donemDusugu.gun = v; }, { min: 7, max: 180, "aria-label": "Dönem (gün)" }), "gün")),
          tetik("dususYuzdesi", "Fiyat belirgin düşünce",
            el("div", { class: "ek" }, "En az %", sayi(f.tetikler.dususYuzdesi.yuzde, (v) => { f.tetikler.dususYuzdesi.yuzde = v; }, { min: 5, max: 80, "aria-label": "Düşüş yüzdesi" }))),
          tetik("takipDusugu", "Takip başladığından beri en düşük fiyat görülünce"),
          hatalar.tetikler && el("p", { class: "hata-metni", role: "alert" }, hatalar.tetikler)),

        el("section", { class: "bolum" }, el("h3", {}, "Bildirim"),
          alan("kanallar", "Kanallar", secim("kanal", "checkbox", KANALLAR.map((k) => [k, KANAL_ADI[k].replace(/^e/, "E"), !kurulu.includes(k)]), f.kanallar,
            (d, acik) => { f.kanallar = acik ? [...f.kanallar, d] : f.kanallar.filter((x) => x !== d); guncelle(); })),
          alan("gunlukSinir", "Günlük bildirim sınırı", sayi(f.gunlukSinir, (v) => { f.gunlukSinir = v; }, { min: 1, max: 20 }))),

        el("div", { id: "ozet", class: "ozet-kutusu" }),
        hatalar.yuk && el("p", { class: "uyari", role: "alert" }, hatalar.yuk),
        el("div", { class: "form-eylemler" },
          el("a", { class: "dugme genis", href: "#takipler" }, "Vazgeç"),
          el("button", { id: "kaydet", class: "dugme birincil genis", type: "submit" }, yeni ? "Takibi kaydet" : "Değişiklikleri kaydet"))));
    guncelle();
  }
  ciz();
}

function yeniTakipEkrani() {
  let ilk = varsayilanTakip(durum.ayarlar);
  try { const t = JSON.parse(localStorage.getItem(TASLAK) || "null"); if (t && typeof t === "object" && t.tetikler && t.varis && t.tarih) ilk = { ...ilk, ...t }; } catch { /* bozuk taslak yok sayılır */ }
  formEkrani(ilk, null);
}

async function duzenleEkrani(kimlik) {
  const { takip } = await api(`/api/takipler/${encodeURIComponent(kimlik)}`);
  const ilk = { ...varsayilanTakip(durum.ayarlar), ...takip };
  ilk.tetikler = { ...varsayilanTakip().tetikler, ...takip.tetikler };
  ilk.varis = { havalimanlari: [], ulkeler: [], ...takip.varis };
  ilk.tarih = { ...varsayilanTakip().tarih, ...takip.tarih };
  formEkrani(ilk, kimlik);
}

// ------------------------------------------------------------------ fırsatlar ekranı

const HAVAYOLU_SITESI = { PC: "https://www.flypgs.com/", VF: "https://ajet.com/", TK: "https://www.turkishairlines.com/", XQ: "https://www.sunexpress.com/" };
const httpsMi = (u) => typeof u === "string" && u.startsWith("https://");

function yasYaz(iso) {
  if (!iso) return "ne zaman görüldüğü bilinmiyor";
  const saat = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (saat < 1) return "1 saatten kısa süre önce görüldü";
  if (saat < 48) return `${Math.round(saat)} saat önce görüldü`;
  return `${Math.round(saat / 24)} gün önce görüldü`;
}

function gunYaz(s) {
  const d = new Date(s + "T00:00:00Z");
  return `${d.getUTCDate()} ${AY_ADI[d.getUTCMonth()].slice(0, 3)} ${GUN_ADI[(d.getUTCDay() + 6) % 7]}`;
}

async function firsatlarEkrani() {
  const { firsatlar } = await api("/api/firsatlar");
  const kayitlar = firsatlar.filter((f) => f.ayrinti && f.ayrinti.kalkis && f.ayrinti.gidis);
  const suzgec = { takip: "", rota: "", ay: "", sira: "yeni" };
  const tekil = (dizi) => [...new Set(dizi)].sort();
  const secici = (etiket, anahtar, secenekler) => el("div", { class: "alan" }, el("label", { for: "s-" + anahtar }, etiket),
    el("select", { id: "s-" + anahtar, onchange: (o) => { suzgec[anahtar] = o.currentTarget.value; ciz(); } },
      secenekler.map(([deger, yazi]) => el("option", { value: deger, selected: suzgec[anahtar] === deger }, yazi))));
  const rota = (f) => `${f.ayrinti.kalkis} → ${f.ayrinti.varis}`;
  const adlar = new Map(kayitlar.map((f) => [f.takip, f.takip_adi]));

  function ciz() {
    let liste = kayitlar.filter((f) => (!suzgec.takip || f.takip === suzgec.takip) && (!suzgec.rota || rota(f) === suzgec.rota) && (!suzgec.ay || f.ayrinti.gidis.startsWith(suzgec.ay)));
    liste = [...liste].sort(suzgec.sira === "ucuz" ? (a, b) => a.fiyat - b.fiyat : suzgec.sira === "tarih" ? (a, b) => a.ayrinti.gidis.localeCompare(b.ayrinti.gidis)
      : (a, b) => b.son_gorulme.localeCompare(a.son_gorulme) || a.fiyat - b.fiyat);
    const kartlar = liste.map((f) => {
      const a = f.ayrinti;
      const havayolu = durum.havayolu.get(a.havayolu) || a.havayolu || "";
      const ad = (k) => durum.havalimani.get(k)?.ad || k;
      return el("article", { class: "kart firsat" },
        el("div", { class: "kart-ust" }, el("h3", {}, `${ad(a.kalkis)} → ${ad(a.varis)}`), el("span", { class: "fiyat rakam" }, tl(f.fiyat))),
        el("p", { class: "ozet-satiri" }, [gunYaz(a.gidis) + (a.donus ? ` – dönüş ${gunYaz(a.donus)}` : ""), havayolu && `${havayolu}${a.ucus_no ? ` ${a.havayolu} ${a.ucus_no}` : ""}`,
          a.aktarma == null ? null : a.aktarma === 0 ? "aktarmasız" : `${a.aktarma} aktarma`].filter(Boolean).join(" · ")),
        el("p", { class: "ozet-satiri" }, `${rota(f)} · ${yasYaz(a.gorulme)} · ${a.bagaj === "dahil" ? "bagaj dahil" : a.bagaj === "yok" ? "bagaj dahil değil" : "bagaj dahil olmayabilir"}`),
        el("div", { class: "olcumler" },
          el("span", {}, "Takip ", el("b", {}, f.takip_adi)),
          el("span", {}, "Bulundu ", el("b", {}, zaman(f.ilk_gorulme))),
          el("span", {}, "Bildirim ", el("b", {}, f.kanallar.length ? f.kanallar.map((k) => KANAL_ADI[k]).join(", ") : "gönderilmedi"))),
        el("div", { class: "kart-eylemler" },
          httpsMi(a.baglanti) && el("a", { class: "dugme kucuk birincil", href: a.baglanti, target: "_blank", rel: "noopener noreferrer" }, "Satın al (aviasales.com)"),
          httpsMi(HAVAYOLU_SITESI[a.havayolu]) && el("a", { class: "dugme kucuk", href: HAVAYOLU_SITESI[a.havayolu], target: "_blank", rel: "noopener noreferrer" }, `${havayolu} sitesi`)));
    });
    goster(
      el("div", { class: "baslik-satiri" }, el("h1", {}, "Fırsatlar"), el("span", { class: "rozet" }, `${liste.length} / ${kayitlar.length}`)),
      el("p", { class: "ipucu not" }, "Fiyatlar önbellekten gelir; satın almadan önce havayolu sitesinde doğrulayın."),
      kayitlar.length > 0 && el("section", { class: "bolum suzgecler" },
        secici("Takip", "takip", [["", "Tüm takipler"], ...tekil(kayitlar.map((f) => f.takip)).map((k) => [k, adlar.get(k)])]),
        secici("Rota", "rota", [["", "Tüm rotalar"], ...tekil(kayitlar.map(rota)).map((r) => [r, r])]),
        secici("Uçuş ayı", "ay", [["", "Tüm aylar"], ...tekil(kayitlar.map((f) => f.ayrinti.gidis.slice(0, 7))).map((a) => [a, `${AY_ADI[Number(a.slice(5)) - 1]} ${a.slice(0, 4)}`])]),
        secici("Sıralama", "sira", [["yeni", "En son görülen"], ["ucuz", "En ucuz"], ["tarih", "Uçuş tarihi"]])),
      kartlar.length ? kartlar : el("p", { class: "bilgi" }, kayitlar.length ? "Bu süzgeçlere uyan fırsat yok." : "Henüz fırsat bulunmadı. Radar her turda bulduklarını buraya yazar."));
  }
  ciz();
}

// ------------------------------------------------------------------ ayarlar ve durum

async function ayarlarEkrani() {
  const a = kopya(durum.ayarlar);
  let mesaj = null, hatalar = {};
  const ciz = () => goster(
    el("div", { class: "baslik-satiri" }, el("h1", {}, "Ayarlar")),
    mesaj && el("p", { class: "ozet-kutusu", role: "status" }, mesaj),
    el("form", { novalidate: true, onsubmit: async (o) => {
      o.preventDefault();
      try {
        const y = await api("/api/ayarlar", { yontem: "PUT", govde: { varsayilan_esik: a.varsayilan_esik, gunluk_sinir: a.gunluk_sinir, varsayilan_kanallar: a.varsayilan_kanallar } });
        durum.ayarlar = y.ayarlar; hatalar = {}; mesaj = "Ayarlar kaydedildi.";
      } catch (e) { hatalar = e.hatalar || {}; mesaj = null; if (!Object.keys(hatalar).length) hatalar.genel = e.message; }
      ciz();
    } },
      el("section", { class: "bolum" }, el("h3", {}, "Yeni takipler için varsayılanlar"),
        hatalar.genel && el("p", { class: "uyari", role: "alert" }, hatalar.genel),
        el("div", { class: "alan" + (hatalar.varsayilan_esik ? " hatali" : "") }, el("label", { for: "a-esik" }, "Varsayılan eşik (TL)"),
          el("input", { id: "a-esik", type: "number", inputmode: "numeric", min: 100, max: 100000, step: 50, value: a.varsayilan_esik, oninput: (o) => { a.varsayilan_esik = Number(o.currentTarget.value); } }),
          hatalar.varsayilan_esik && el("p", { class: "hata-metni" }, hatalar.varsayilan_esik)),
        el("div", { class: "alan" + (hatalar.gunluk_sinir ? " hatali" : "") }, el("label", { for: "a-sinir" }, "Takip başına günlük bildirim sınırı"),
          el("input", { id: "a-sinir", type: "number", inputmode: "numeric", min: 1, max: 20, value: a.gunluk_sinir, oninput: (o) => { a.gunluk_sinir = Number(o.currentTarget.value); } }),
          hatalar.gunluk_sinir && el("p", { class: "hata-metni" }, hatalar.gunluk_sinir)),
        el("div", { class: "alan" }, el("span", { class: "etiket" }, "Varsayılan kanallar"),
          el("div", { class: "secenekler" }, KANALLAR.map((k) => el("label", { class: "secenek" },
            el("input", { type: "checkbox", checked: a.varsayilan_kanallar.includes(k), onchange: (o) => {
              a.varsayilan_kanallar = o.currentTarget.checked ? [...a.varsayilan_kanallar, k] : a.varsayilan_kanallar.filter((x) => x !== k);
            } }), el("span", {}, KANAL_ADI[k].replace(/^e/, "E"))))),
          hatalar.varsayilan_kanallar && el("p", { class: "hata-metni" }, hatalar.varsayilan_kanallar),
          el("p", { class: "ipucu" }, "Sessiz saat yoktur: bildirim, fırsatın bulunduğu turda hemen gönderilir."))),
      el("button", { class: "dugme birincil genis", type: "submit" }, "Ayarları kaydet")));
  ciz();
}

async function durumEkrani() {
  const d = await api("/api/durum");
  const satir = (b, v) => el("tr", {}, el("th", { scope: "row" }, b), el("td", { class: "rakam" }, v));
  const t = d.sonTur;
  goster(
    el("div", { class: "baslik-satiri" }, el("h1", {}, "Durum")),
    el("section", { class: "bolum" }, el("h3", {}, "Son tur"), t
      ? el("table", { class: "tablo" }, el("tbody", {}, satir("Zaman", zaman(t.zaman)), satir("Sonuç", t.durum), satir("Tetik", t.tetik || "–"),
          satir("Süre", t.sure_sn != null ? `${t.sure_sn} sn` : "–"), satir("Sorgu", `${t.sorgu ?? "–"} (hata ${t.sorgu_hata ?? 0})`),
          satir("Gözlem", String(t.gozlem ?? "–")), satir("Fırsat", String(t.firsat ?? "–")), satir("Kalan sorgu bütçesi", `${t.butce_kalan ?? "–"} / ${d.turButcesi}`)))
      : el("p", { class: "bilgi" }, "Radar henüz hiç tur çalıştırmadı.")),
    el("section", { class: "bolum" }, el("h3", {}, "Fırsatlar"), el("table", { class: "tablo" }, el("tbody", {},
      satir("Son 24 saatte görülen", String(d.sonGunFirsat ?? 0))))),
    (d.sonTurlar || []).length > 1 && el("section", { class: "bolum" }, el("h3", {}, "Son turlar"), el("table", { class: "tablo turlar" },
      el("thead", {}, el("tr", {}, ["Zaman", "Sonuç", "Sorgu", "Gözlem", "Fırsat"].map((b) => el("th", { scope: "col" }, b)))),
      el("tbody", {}, d.sonTurlar.map((x) => el("tr", {}, el("td", {}, zaman(x.zaman)), el("td", {}, x.durum),
        el("td", { class: "rakam" }, `${x.sorgu ?? "–"}${x.sorgu_hata ? ` (${x.sorgu_hata} hata)` : ""}`), el("td", { class: "rakam" }, String(x.gozlem ?? "–")),
        el("td", { class: "rakam" }, String(x.firsat ?? "–"))))))),
    el("section", { class: "bolum" }, el("h3", {}, "Takipler"), el("table", { class: "tablo" }, el("tbody", {},
      satir("Etkin", `${d.takipler.etkin || 0} / ${SINIR.etkinTakip}`), satir("Duraklatılmış", String(d.takipler.duraklatildi || 0)), satir("Süresi dolmuş", String(d.takipler["suresi-doldu"] || 0))))),
    el("section", { class: "bolum" }, el("h3", {}, "Kanallar"), el("p", {}, d.kuruluKanallar
      ? (d.kuruluKanallar.length ? "Kurulu: " + d.kuruluKanallar.map((k) => KANAL_ADI[k]).join(", ") : "Kurulu kanal yok.")
      : "Radar ilk turunu çalıştırınca kurulu kanallar burada görünür.")),
    el("section", { class: "bolum" }, el("h3", {}, "Kaynaklar"), d.kaynaklar.length
      ? el("table", { class: "tablo" }, el("tbody", {}, d.kaynaklar.map((k) => satir(k.kaynak, k.art_arda_hata ? `${k.art_arda_hata} art arda hata` : `son başarı ${zaman(k.son_basari)}`))))
      : el("p", { class: "bilgi" }, "Henüz kaynak kaydı yok.")));
}

// ------------------------------------------------------------------ başlangıç ve yönlendirme

async function yonlendir() {
  const [bolum, deger] = (location.hash.replace(/^#/, "") || "takipler").split("/");
  for (const a of document.querySelectorAll(".alt-gezinme a")) {
    if (a.dataset.bolum === (["yeni", "duzenle"].includes(bolum) ? "takipler" : bolum)) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  try {
    if (bolum === "yeni") yeniTakipEkrani();
    else if (bolum === "duzenle" && deger) await duzenleEkrani(deger);
    else if (bolum === "firsatlar") await firsatlarEkrani();
    else if (bolum === "ayarlar") await ayarlarEkrani();
    else if (bolum === "durum") await durumEkrani();
    else await takiplerEkrani();
  } catch (e) { if (e.durum !== 401) hataGoster(e); }
}

document.getElementById("tema-dugmesi").addEventListener("click", () => {
  const yeni = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", yeni);
  try { localStorage.setItem("radar.tema", yeni); } catch { /* depolama kapalı */ }
});
document.getElementById("cikis-dugmesi").addEventListener("click", async () => {
  try { await api("/api/cikis", { yontem: "POST", govde: {} }); } catch { /* yine de giriş sayfasına gidilir */ }
  location.replace("/giris");
});

(async () => {
  try {
    const [sabit, ayar] = await Promise.all([api("/api/sabitler"), api("/api/ayarlar")]);
    durum.sabit = sabit; durum.ayarlar = ayar.ayarlar;
    durum.havalimani = new Map(sabit.havalimanlari.map((h) => [h.kod, h]));
    durum.havayolu = new Map(sabit.havayollari.map((h) => [h.kod, h.ad]));
    window.addEventListener("hashchange", yonlendir);
    await yonlendir();
  } catch (e) { if (e.durum !== 401) hataGoster(e); }
})();
