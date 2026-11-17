// Kasa: panel dosyaları + panel API'si (oturumla) + radar API'si (anahtarla). Veri Cloudflare D1'de durur.
// Kişisel bilgi tutmaz: telefon numarası, sohbet kimliği ve e-posta adresi burada yoktur.

import { dogrula, sorguYuku, SINIR, KANALLAR, VARSAYILAN, bugunTR, pencere } from "../../panel/ortak/kurallar.js";
import HAVALIMANLARI from "../../radar/veri/havalimanlari.json" with { type: "json" };
import HAVAYOLLARI from "../../radar/veri/havayollari.json" with { type: "json" };
import * as oturum from "./oturum.js";

const HAVALIMANI = new Map(HAVALIMANLARI.map((x) => [x.kod, x]));
const HAVAYOLU = new Map(HAVAYOLLARI.map((x) => [x.kod, x.ad]));

// Girişsiz açılabilen dosyalar: yalnızca giriş sayfası ve tasarım dosyaları. Veri içermezler.
const ACIK_DOSYALAR = new Set(["/giris", "/giris.html", "/giris.js", "/style.css", "/theme.js", "/logo.svg"]);
const EN_BUYUK_GOVDE = 1_000_000;
const KIMLIK = /^[a-f0-9]{8}$/;

const GUVENLIK_BASLIKLARI = {
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; " +
    "connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "permissions-policy": "geolocation=(), camera=(), microphone=()",
  "strict-transport-security": "max-age=31536000",
};

const json = (veri, durum = 200, ek = {}) => new Response(JSON.stringify(veri), {
  status: durum, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...ek },
});
const hata = (durum, mesaj, ek = {}) => json({ hata: mesaj, ...ek }, durum);
const simdiISO = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const simdiSn = () => Math.floor(Date.now() / 1000);

function guvenli(yanit) {
  const y = new Response(yanit.body, yanit);
  for (const [k, v] of Object.entries(GUVENLIK_BASLIKLARI)) y.headers.set(k, v);
  return y;
}

async function govdeOku(request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return { hata: hata(415, "İçerik türü application/json olmalı.") };
  const metin = await request.text();
  if (metin.length > EN_BUYUK_GOVDE) return { hata: hata(413, "İstek çok büyük.") };
  try {
    const veri = JSON.parse(metin);
    if (!veri || typeof veri !== "object" || Array.isArray(veri)) throw new Error("nesne değil");
    return { veri };
  } catch { return { hata: hata(400, "Geçersiz JSON.") }; }
}

/** Tarayıcıdan gelen değiştirme isteklerinde köken kendi adresimiz olmalı (CSRF). */
function kokenUygun(request, url) {
  const koken = request.headers.get("origin");
  if (koken && koken !== url.origin) return false;
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

// ------------------------------------------------------------------ takip satırı ↔ nesne

const J = (x) => JSON.stringify(x);
const coz = (s, yedek) => { try { return s == null ? yedek : JSON.parse(s); } catch { return yedek; } };

function satirdanTakip(s) {
  const suz = coz(s.suzgecler, {});
  return {
    kimlik: s.kimlik, ad: s.ad, tur: s.tur, durum: s.durum,
    kalkis: coz(s.kalkis, []), varis: coz(s.varis, {}), yon: s.yon, tarih: coz(s.tarih, {}), donus: coz(s.donus, null),
    yolcu: suz.yolcu ?? 1, aktarma: suz.aktarma ?? "farketmez", havayolu: suz.havayolu ?? { kip: "hepsi", kodlar: [] }, saat: suz.saat ?? null,
    tetikler: coz(s.tetikler, {}), kanallar: coz(s.kanallar, []), gunlukSinir: s.gunluk_sinir,
    pencereSurumu: s.pencere_surumu, olusturma: s.olusturma, guncelleme: s.guncelleme, sonTarama: s.son_tarama, sonFiyat: s.son_fiyat,
  };
}

const takipSutunlari = (t) => [t.ad, t.tur, J(t.kalkis), J(t.varis), t.yon, J(t.tarih), t.donus ? J(t.donus) : null,
  J({ yolcu: t.yolcu, aktarma: t.aktarma, havayolu: t.havayolu, saat: t.saat }), J(t.tetikler), J(t.kanallar), t.gunlukSinir];

const yeniKimlik = () => [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");

// ------------------------------------------------------------------ ayarlar

const AYAR_VARSAYILAN = { varsayilan_esik: VARSAYILAN.esik, gunluk_sinir: VARSAYILAN.gunlukSinir, varsayilan_kanallar: VARSAYILAN.kanallar, kurulu_kanallar: null };

async function ayarlariOku(db) {
  const { results } = await db.prepare("SELECT anahtar, deger FROM ayar").all();
  const a = { ...AYAR_VARSAYILAN };
  for (const s of results) if (s.anahtar in a) a[s.anahtar] = coz(s.deger, a[s.anahtar]);
  return a;
}

function ayarDogrula(g) {
  const h = {}, a = {};
  if ("varsayilan_esik" in g) { const n = Number(g.varsayilan_esik); if (Number.isInteger(n) && n >= 100 && n <= 100000) a.varsayilan_esik = n; else h.varsayilan_esik = "Eşik 100–100.000 TL olmalı."; }
  if ("gunluk_sinir" in g) { const n = Number(g.gunluk_sinir); if (Number.isInteger(n) && n >= 1 && n <= 20) a.gunluk_sinir = n; else h.gunluk_sinir = "Günlük sınır 1–20 olmalı."; }
  if ("varsayilan_kanallar" in g) {
    const k = Array.isArray(g.varsayilan_kanallar) ? [...new Set(g.varsayilan_kanallar.map(String))] : [];
    if (k.length && k.every((x) => KANALLAR.includes(x))) a.varsayilan_kanallar = KANALLAR.filter((x) => k.includes(x)); else h.varsayilan_kanallar = "En az bir kanal seçin.";
  }
  return { hatalar: h, ayarlar: a };
}

const baglam = (ayarlar) => ({ havalimanlari: HAVALIMANI, havayollari: HAVAYOLU, bugun: bugunTR(), kanallar: ayarlar.kurulu_kanallar || KANALLAR });

// ------------------------------------------------------------------ giriş

async function giris(request, env, url) {
  if (!oturum.kurulumTamam(env)) return hata(503, "Kurulum tamamlanmadı: giriş parolası ve oturum anahtarı tanımlı değil.");
  if (!kokenUygun(request, url)) return hata(403, "İstek reddedildi.");
  const { veri, hata: h } = await govdeOku(request);
  if (h) return h;
  const sn = simdiSn();
  const ozet = await oturum.ipOzeti(request, env);
  if (await oturum.denemeSayisi(env.DB, ozet, sn) >= oturum.DENEME_SINIRI) {
    return hata(429, "Çok fazla hatalı deneme. 15 dakika sonra yeniden deneyin.", {}, );
  }
  const parola = typeof veri.parola === "string" ? veri.parola : "";
  if (!parola || parola.length > 200 || !(await oturum.parolaDogru(parola, env.PANEL_PAROLA_OZETI))) {
    await oturum.denemeKaydet(env.DB, ozet, sn);
    return hata(401, "Parola hatalı.");
  }
  return json({ tamam: true }, 200, { "set-cookie": await oturum.cerezUret(env, sn) });
}

// ------------------------------------------------------------------ panel API'si (oturum gerekir)

async function panelApi(request, env, url) {
  const yol = url.pathname, m = request.method, db = env.DB;
  if (m !== "GET" && !kokenUygun(request, url)) return hata(403, "İstek reddedildi.");

  if (yol === "/api/cikis" && m === "POST") return json({ tamam: true }, 200, { "set-cookie": oturum.cerezSil() });

  if (yol === "/api/sabitler" && m === "GET") return json({ havalimanlari: HAVALIMANLARI, havayollari: HAVAYOLLARI, sinir: SINIR });

  if (yol === "/api/ayarlar") {
    if (m === "GET") return json({ ayarlar: await ayarlariOku(db) });
    if (m === "PUT") {
      const { veri, hata: h } = await govdeOku(request);
      if (h) return h;
      const { hatalar, ayarlar } = ayarDogrula(veri);
      if (Object.keys(hatalar).length) return hata(422, "Ayarlar geçersiz.", { hatalar });
      const islemler = Object.entries(ayarlar).map(([k, v]) => db.prepare(
        "INSERT INTO ayar (anahtar, deger) VALUES (?1, ?2) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger").bind(k, J(v)));
      if (islemler.length) await db.batch(islemler);
      return json({ ayarlar: await ayarlariOku(db) });
    }
    return hata(405, "Yöntem desteklenmiyor.");
  }

  if (yol === "/api/durum" && m === "GET") {
    const [sonTur, sayim, kaynaklar, ayarlar] = await Promise.all([
      db.prepare("SELECT * FROM tur ORDER BY id DESC LIMIT 1").first(),
      db.prepare("SELECT durum, COUNT(*) AS n FROM takip WHERE durum != 'silindi' GROUP BY durum").all(),
      db.prepare("SELECT * FROM kaynak_durum ORDER BY kaynak").all(),
      ayarlariOku(db),
    ]);
    return json({ sonTur: sonTur || null, takipler: Object.fromEntries(sayim.results.map((s) => [s.durum, s.n])),
      kaynaklar: kaynaklar.results, kuruluKanallar: ayarlar.kurulu_kanallar, turButcesi: SINIR.turButcesi });
  }

  if (yol === "/api/firsatlar" && m === "GET") {
    const { results } = await db.prepare("SELECT * FROM firsat ORDER BY son_gorulme DESC LIMIT 100").all();
    return json({ firsatlar: results.map((f) => ({ ...f, tetikler: coz(f.tetikler, []), ayrinti: coz(f.ayrinti, null) })) });
  }

  if (yol === "/api/kampanyalar" && m === "GET") {
    const { results } = await db.prepare("SELECT * FROM kampanya ORDER BY son_gorulme DESC LIMIT 100").all();
    return json({ kampanyalar: results });
  }

  if (yol === "/api/takipler") {
    if (m === "GET") {
      const { results } = await db.prepare("SELECT * FROM takip WHERE durum != 'silindi' ORDER BY olusturma DESC").all();
      const bugun = bugunTR();
      return json({ takipler: results.map((s) => { const t = satirdanTakip(s); return { ...t, sorguYuku: sorguYuku(t, bugun) }; }) });
    }
    if (m === "POST") {
      const { veri, hata: h } = await govdeOku(request);
      if (h) return h;
      const sonuc = dogrula(veri, baglam(await ayarlariOku(db)));
      if (!sonuc.tamam) return hata(422, "Takip kaydedilemedi; işaretli alanları düzeltin.", { hatalar: sonuc.hatalar });
      const etkin = await db.prepare("SELECT COUNT(*) AS n FROM takip WHERE durum = 'etkin'").first();
      if (Number(etkin.n) >= SINIR.etkinTakip) return hata(409, `En fazla ${SINIR.etkinTakip} etkin takip olabilir.`);
      const kimlik = yeniKimlik(), an = simdiISO();
      await db.prepare(`INSERT INTO takip (kimlik, ad, tur, kalkis, varis, yon, tarih, donus, suzgecler, tetikler, kanallar, gunluk_sinir, durum, olusturma, guncelleme)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'etkin', ?13, ?13)`).bind(kimlik, ...takipSutunlari(sonuc.takip), an).run();
      return json({ takip: satirdanTakip(await db.prepare("SELECT * FROM takip WHERE kimlik = ?1").bind(kimlik).first()) }, 201);
    }
    return hata(405, "Yöntem desteklenmiyor.");
  }

  const es = yol.match(/^\/api\/takipler\/([^/]+)(?:\/(duraklat|surdur|cogalt))?$/);
  if (es) {
    const [, kimlik, eylem] = es;
    if (!KIMLIK.test(kimlik)) return hata(404, "Takip bulunamadı.");
    const satir = await db.prepare("SELECT * FROM takip WHERE kimlik = ?1 AND durum != 'silindi'").bind(kimlik).first();
    if (!satir) return hata(404, "Takip bulunamadı.");
    const an = simdiISO();

    if (!eylem && m === "GET") return json({ takip: satirdanTakip(satir) });

    if (!eylem && m === "PUT") {
      const { veri, hata: h } = await govdeOku(request);
      if (h) return h;
      const sonuc = dogrula(veri, baglam(await ayarlariOku(db)));
      if (!sonuc.tamam) return hata(422, "Takip kaydedilemedi; işaretli alanları düzeltin.", { hatalar: sonuc.hatalar });
      const t = sonuc.takip;
      // Kalkış, varış ya da tarih penceresi değiştiyse takip yeni sayılır (Y-2)
      const degisti = J(t.kalkis) !== satir.kalkis || J(t.varis) !== satir.varis || J(t.tarih) !== satir.tarih || (t.donus ? J(t.donus) : null) !== satir.donus;
      const durum = satir.durum === "suresi-doldu" && degisti ? "etkin" : satir.durum;
      await db.prepare(`UPDATE takip SET ad = ?2, tur = ?3, kalkis = ?4, varis = ?5, yon = ?6, tarih = ?7, donus = ?8, suzgecler = ?9, tetikler = ?10,
        kanallar = ?11, gunluk_sinir = ?12, guncelleme = ?13, durum = ?14, pencere_surumu = pencere_surumu + ?15 WHERE kimlik = ?1`)
        .bind(kimlik, ...takipSutunlari(t), an, durum, degisti ? 1 : 0).run();
      return json({ takip: satirdanTakip(await db.prepare("SELECT * FROM takip WHERE kimlik = ?1").bind(kimlik).first()) });
    }

    if (!eylem && m === "DELETE") {
      await db.prepare("UPDATE takip SET durum = 'silindi', silinme = ?2, guncelleme = ?2 WHERE kimlik = ?1").bind(kimlik, an).run();
      return json({ tamam: true });
    }

    if (eylem && m === "POST") {
      if (eylem === "duraklat") {
        if (satir.durum !== "etkin") return hata(409, "Yalnızca etkin takip duraklatılabilir.");
        await db.prepare("UPDATE takip SET durum = 'duraklatildi', guncelleme = ?2 WHERE kimlik = ?1").bind(kimlik, an).run();
      } else if (eylem === "surdur") {
        if (satir.durum !== "duraklatildi") return hata(409, "Yalnızca duraklatılmış takip sürdürülebilir.");
        const etkin = await db.prepare("SELECT COUNT(*) AS n FROM takip WHERE durum = 'etkin'").first();
        if (Number(etkin.n) >= SINIR.etkinTakip) return hata(409, `En fazla ${SINIR.etkinTakip} etkin takip olabilir.`);
        await db.prepare("UPDATE takip SET durum = 'etkin', guncelleme = ?2 WHERE kimlik = ?1").bind(kimlik, an).run();
      } else {
        const yeni = yeniKimlik();
        await db.prepare(`INSERT INTO takip (kimlik, ad, tur, kalkis, varis, yon, tarih, donus, suzgecler, tetikler, kanallar, gunluk_sinir, durum, olusturma, guncelleme)
          SELECT ?2, substr(ad || ' (kopya)', 1, 60), tur, kalkis, varis, yon, tarih, donus, suzgecler, tetikler, kanallar, gunluk_sinir, 'duraklatildi', ?3, ?3
          FROM takip WHERE kimlik = ?1`).bind(kimlik, yeni, an).run();
        return json({ takip: satirdanTakip(await db.prepare("SELECT * FROM takip WHERE kimlik = ?1").bind(yeni).first()) }, 201);
      }
      return json({ takip: satirdanTakip(await db.prepare("SELECT * FROM takip WHERE kimlik = ?1").bind(kimlik).first()) });
    }
    return hata(405, "Yöntem desteklenmiyor.");
  }

  return hata(404, "Böyle bir uç yok.");
}

// ------------------------------------------------------------------ radar API'si (yalnızca iki işlem)

async function radarApi(request, env, url) {
  const anahtar = env.RADAR_API_TOKEN;
  const baslik = request.headers.get("authorization") || "";
  const gelen = baslik.startsWith("Bearer ") ? baslik.slice(7) : "";
  if (typeof anahtar !== "string" || anahtar.length < 32 || !gelen || !(await oturum.esitMi(gelen, anahtar))) {
    return hata(401, "Yetkisiz.", {}, );
  }
  const yol = url.pathname, m = request.method, db = env.DB;

  if (yol === "/api/ic/takipler" && m === "GET") {
    const { results } = await db.prepare("SELECT * FROM takip WHERE durum = 'etkin' ORDER BY COALESCE(son_tarama, '') ASC").all();
    const bugun = bugunTR();
    return json({ bugun, ayarlar: await ayarlariOku(db), takipler: results.map((s) => { const t = satirdanTakip(s); return { ...t, pencere: pencere(t, bugun) }; }) });
  }

  if (yol === "/api/ic/sonuc" && m === "POST") {
    const { veri, hata: h } = await govdeOku(request);
    if (h) return h;
    const an = simdiISO();
    const dizi = (x, en) => (Array.isArray(x) ? x.slice(0, en) : []);
    const metin = (x, en = 300) => (x == null ? null : String(x).slice(0, en));
    const sayi = (x) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : null);
    const kod = (x) => (typeof x === "string" && /^[A-Z0-9]{2,3}$/.test(x) ? x : null);
    const islemler = [];

    if (veri.tur && typeof veri.tur === "object") {
      const t = veri.tur;
      islemler.push(db.prepare(`INSERT INTO tur (zaman, durum, tetik, sure_sn, takip, sorgu, sorgu_hata, gozlem, firsat, bildirim_hata, butce_kalan)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`).bind(an, metin(t.durum, 20) || "tamam", metin(t.tetik, 30), sayi(t.sure_sn),
        sayi(t.takip), sayi(t.sorgu), sayi(t.sorgu_hata), sayi(t.gozlem), sayi(t.firsat), sayi(t.bildirim_hata), sayi(t.butce_kalan)));
      islemler.push(db.prepare("DELETE FROM tur WHERE id NOT IN (SELECT id FROM tur ORDER BY id DESC LIMIT 500)"));
    }
    if (Array.isArray(veri.kanallar)) {
      const k = KANALLAR.filter((x) => veri.kanallar.includes(x));
      islemler.push(db.prepare("INSERT INTO ayar (anahtar, deger) VALUES ('kurulu_kanallar', ?1) ON CONFLICT(anahtar) DO UPDATE SET deger = excluded.deger").bind(J(k)));
    }
    for (const g of dizi(veri.gozlemler, 2000)) {
      if (!kod(g.kalkis) || !kod(g.varis) || !/^\d{4}-\d{2}-\d{2}$/.test(String(g.gidis)) || sayi(g.fiyat) === null) continue;
      islemler.push(db.prepare(`INSERT INTO gozlem (kalkis, varis, gidis, donus, fiyat, havayolu, ucus_no, aktarma, bagaj, kaynak, gorulme, okunma, baglanti, belirsiz)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`).bind(g.kalkis, g.varis, g.gidis, metin(g.donus, 10), sayi(g.fiyat), metin(g.havayolu, 3),
        metin(g.ucus_no, 8), sayi(g.aktarma), metin(g.bagaj, 20), metin(g.kaynak, 30) || "bilinmiyor", metin(g.gorulme, 25), an,
        typeof g.baglanti === "string" && g.baglanti.startsWith("https://") ? g.baglanti.slice(0, 1000) : null, g.belirsiz ? 1 : 0));
    }
    for (const t of dizi(veri.tabanlar, 2000)) {
      if (!kod(t.kalkis) || !kod(t.varis) || sayi(t.en_dusuk) === null) continue;
      islemler.push(db.prepare(`INSERT INTO gunluk_taban (kalkis, varis, ucus_ayi, gun, en_dusuk) VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(kalkis, varis, ucus_ayi, gun) DO UPDATE SET en_dusuk = MIN(en_dusuk, excluded.en_dusuk)`).bind(t.kalkis, t.varis, metin(t.ucus_ayi, 7), metin(t.gun, 10), sayi(t.en_dusuk)));
    }
    for (const f of dizi(veri.firsatlar, 500)) {
      if (!KIMLIK.test(String(f.takip)) || !f.anahtar || sayi(f.fiyat) === null) continue;
      islemler.push(db.prepare(`INSERT INTO firsat (takip, anahtar, fiyat, tetikler, ilk_gorulme, son_gorulme, son_bildirilen_fiyat, durum, ayrinti)
        VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8) ON CONFLICT(takip, anahtar) DO UPDATE SET fiyat = excluded.fiyat, tetikler = excluded.tetikler,
        son_gorulme = excluded.son_gorulme, son_bildirilen_fiyat = COALESCE(excluded.son_bildirilen_fiyat, son_bildirilen_fiyat), durum = excluded.durum, ayrinti = excluded.ayrinti`)
        .bind(f.takip, metin(f.anahtar, 120), sayi(f.fiyat), J(dizi(f.tetikler, 10)), an, sayi(f.son_bildirilen_fiyat), metin(f.durum, 20) || "yeni", f.ayrinti ? J(f.ayrinti).slice(0, 4000) : null));
    }
    for (const g of dizi(veri.gonderimler, 2000)) {
      if (!g.anahtar || !KANALLAR.includes(g.kanal)) continue;
      islemler.push(db.prepare(`INSERT INTO gonderim (anahtar, kanal, durum, deneme, zaman) VALUES (?1, ?2, ?3, 1, ?4)
        ON CONFLICT(anahtar, kanal) DO UPDATE SET durum = excluded.durum, deneme = deneme + 1, zaman = excluded.zaman`).bind(metin(g.anahtar, 160), g.kanal, metin(g.durum, 20) || "gonderildi", an));
    }
    for (const t of dizi(veri.taramalar, 200)) {
      if (!KIMLIK.test(String(t.takip))) continue;
      islemler.push(db.prepare("UPDATE takip SET son_tarama = ?2, son_fiyat = COALESCE(?3, son_fiyat) WHERE kimlik = ?1").bind(t.takip, an, sayi(t.son_fiyat)));
    }
    for (const k of dizi(veri.suresiDolanlar, 200)) {
      if (KIMLIK.test(String(k))) islemler.push(db.prepare("UPDATE takip SET durum = 'suresi-doldu', guncelleme = ?2 WHERE kimlik = ?1 AND durum = 'etkin'").bind(k, an));
    }
    for (const k of dizi(veri.kaynaklar, 50)) {
      if (!k.kaynak) continue;
      const basarili = k.durum === "tamam";
      islemler.push(db.prepare(`INSERT INTO kaynak_durum (kaynak, son_basari, son_hata, art_arda_hata) VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(kaynak) DO UPDATE SET son_basari = COALESCE(excluded.son_basari, son_basari), son_hata = COALESCE(excluded.son_hata, son_hata),
        art_arda_hata = CASE WHEN ?4 = 0 THEN 0 ELSE art_arda_hata + 1 END`).bind(metin(k.kaynak, 30), basarili ? an : null, basarili ? null : an, basarili ? 0 : 1));
    }
    if (islemler.length) await db.batch(islemler);
    return json({ tamam: true, islem: islemler.length });
  }

  return hata(404, "Böyle bir uç yok.");
}

// ------------------------------------------------------------------ yönlendirme

async function yonlendir(request, env) {
  const url = new URL(request.url);
  const yol = url.pathname, m = request.method;
  const okuma = m === "GET" || m === "HEAD";

  if (ACIK_DOSYALAR.has(yol) || yol.startsWith("/vendor/fonts/")) {
    return okuma ? env.ASSETS.fetch(request) : hata(405, "Yöntem desteklenmiyor.");
  }
  if (yol === "/api/giris") return m === "POST" ? giris(request, env, url) : hata(405, "Yöntem desteklenmiyor.");
  if (yol.startsWith("/api/ic/")) return radarApi(request, env, url);

  const girisli = await oturum.oturumGecerli(request, env, simdiSn());
  if (yol.startsWith("/api/")) return girisli ? panelApi(request, env, url) : hata(401, "Giriş gerekli.");
  if (!girisli) return new Response(null, { status: 302, headers: { location: "/giris", "cache-control": "no-store" } });
  if (!okuma) return hata(405, "Yöntem desteklenmiyor.");
  const yanit = await env.ASSETS.fetch(request);
  const y = new Response(yanit.body, yanit);
  y.headers.set("cache-control", "no-store");
  return y;
}

export default {
  async fetch(request, env) {
    try {
      return guvenli(await yonlendir(request, env));
    } catch (e) {
      console.error("kasa hatası:", e && e.name);  // ayrıntı ve veri günlüğe yazılmaz
      return guvenli(hata(500, "Beklenmeyen bir hata oluştu."));
    }
  },
};
