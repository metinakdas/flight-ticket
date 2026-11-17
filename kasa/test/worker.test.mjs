// Kasa worker'ının uçtan uca testleri: giriş koruması, panel API'si, radar API'si, güvenlik başlıkları.
import test from "node:test";
import assert from "node:assert/strict";
import { ortamKur, ornekTakip, PAROLA, KOKEN } from "./yardimci.mjs";
import worker from "../src/worker.js";

const PANEL_UCLARI = ["/api/takipler", "/api/firsatlar", "/api/kampanyalar", "/api/ayarlar", "/api/durum", "/api/sabitler",
  "/api/takipler/abcdef12", "/api/analiz", "/api/olmayan"];

test("girişsiz hiçbir panel ucu veri vermez (401)", async () => {
  const { istek } = await ortamKur();
  for (const yol of PANEL_UCLARI) {
    const y = await istek(yol);
    assert.equal(y.status, 401, yol);
    assert.deepEqual(Object.keys(await y.json()), ["hata"], yol);
  }
  for (const [yol, yontem] of [["/api/takipler", "POST"], ["/api/takipler/abcdef12", "PUT"], ["/api/takipler/abcdef12", "DELETE"], ["/api/ayarlar", "PUT"], ["/api/cikis", "POST"]]) {
    assert.equal((await istek(yol, { yontem, govde: ornekTakip() })).status, 401, `${yontem} ${yol}`);
  }
});

test("girişsiz sayfa ve dosya istekleri giriş sayfasına yönlenir; yalnızca giriş ve tasarım dosyaları açıktır", async () => {
  const { istek } = await ortamKur();
  for (const yol of ["/", "/index.html", "/app.js", "/ortak/kurallar.js", "/olmayan", "/.env", "/vendor/", "/../kasa/src/worker.js"]) {
    const y = await istek(yol);
    assert.equal(y.status, 302, yol);
    assert.equal(y.headers.get("location"), "/giris");
  }
  for (const yol of ["/giris", "/giris.js", "/style.css", "/theme.js", "/logo.svg", "/vendor/fonts/inter-latin-wght-normal.woff2"]) {
    assert.equal((await istek(yol)).status, 200, yol);
  }
  assert.equal((await istek("/giris", { yontem: "POST", govde: {} })).status, 405);
});

test("sahte ya da süresi dolmuş çerezle giriş yapılamaz", async () => {
  const { istek, girisYap } = await ortamKur();
  const gercek = await girisYap();
  const [ad, deger] = gercek.split("=");
  const [bitis, imza] = deger.split(".");
  for (const cerez of ["oturum=1", "oturum=abc.def", `${ad}=${Number(bitis) + 1}.${imza}`, `${ad}=${bitis}.${imza.slice(0, -2)}xx`, `${ad}=1000.${imza}`]) {
    assert.equal((await istek("/api/takipler", { cerez })).status, 401, cerez.slice(0, 20));
  }
  assert.equal((await istek("/api/takipler", { cerez: gercek })).status, 200);
});

test("giriş: yanlış parola 401, doğru parola HttpOnly + Secure + SameSite=Strict çerez verir", async () => {
  const { istek } = await ortamKur();
  assert.equal((await istek("/api/giris", { yontem: "POST", govde: { parola: "yanlis" } })).status, 401);
  assert.equal((await istek("/api/giris", { yontem: "POST", govde: {} })).status, 401);
  assert.equal((await istek("/api/giris")).status, 405);
  const y = await istek("/api/giris", { yontem: "POST", govde: { parola: PAROLA } });
  assert.equal(y.status, 200);
  const cerez = y.headers.get("set-cookie");
  for (const parca of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) assert.ok(cerez.includes(parca), parca);
  assert.ok(!cerez.includes(PAROLA));
});

test("giriş: IP başına 15 dakikada 5 hatalı denemeden sonra kilitlenir; başka IP etkilenmez", async () => {
  const { istek, env } = await ortamKur();
  for (let i = 0; i < 5; i++) assert.equal((await istek("/api/giris", { yontem: "POST", govde: { parola: "yanlis" + i } })).status, 401);
  assert.equal((await istek("/api/giris", { yontem: "POST", govde: { parola: PAROLA } })).status, 429);
  assert.equal((await istek("/api/giris", { yontem: "POST", govde: { parola: PAROLA }, ip: "198.51.100.9" })).status, 200);
  // IP'nin kendisi veritabanında durmaz
  const satirlar = env.DB.ham.prepare("SELECT ip_ozeti FROM giris_deneme").all();
  assert.ok(satirlar.length >= 5 && satirlar.every((s) => !s.ip_ozeti.includes("203.0.113")));
  // 15 dakika geçince kilit açılır
  env.DB.ham.exec("UPDATE giris_deneme SET zaman = zaman - 901");
  assert.equal((await istek("/api/giris", { yontem: "POST", govde: { parola: PAROLA } })).status, 200);
});

test("kurulum eksikse (parola özeti ya da oturum anahtarı yok) kimse giremez", async () => {
  for (const ek of [{ PANEL_PAROLA_OZETI: undefined }, { OTURUM_ANAHTARI: undefined }, { OTURUM_ANAHTARI: "kisa" }, { PANEL_PAROLA_OZETI: "duz-metin" }]) {
    const { istek } = await ortamKur(ek);
    assert.equal((await istek("/api/giris", { yontem: "POST", govde: { parola: PAROLA } })).status, 503);
    assert.equal((await istek("/api/takipler", { cerez: "oturum=9999999999.x" })).status, 401);
  }
});

test("başka kökenden gelen değiştirme istekleri reddedilir (CSRF)", async () => {
  const { istek, girisYap } = await ortamKur();
  const cerez = await girisYap();
  const y = await istek("/api/takipler", { yontem: "POST", govde: ornekTakip(), cerez, basliklar: { origin: "https://saldirgan.example" } });
  assert.equal(y.status, 403);
  const y2 = await istek("/api/takipler", { yontem: "POST", govde: ornekTakip(), cerez, basliklar: { "sec-fetch-site": "cross-site" } });
  assert.equal(y2.status, 403);
  const y3 = await istek("/api/takipler", { yontem: "POST", govde: JSON.stringify(ornekTakip()), cerez, basliklar: { "content-type": "text/plain" } });
  assert.equal(y3.status, 415);
});

test("takip eklenir, listelenir, düzenlenir, duraklatılır, sürdürülür, çoğaltılır ve silinir", async () => {
  const { istek, girisYap } = await ortamKur();
  const cerez = await girisYap();
  const ekle = await istek("/api/takipler", { yontem: "POST", govde: ornekTakip(), cerez });
  assert.equal(ekle.status, 201);
  const { takip } = await ekle.json();
  assert.match(takip.kimlik, /^[a-f0-9]{8}$/);
  assert.equal(takip.durum, "etkin");
  assert.equal(takip.ad, "SAW → ERZ");

  const liste = await (await istek("/api/takipler", { cerez })).json();
  assert.equal(liste.takipler.length, 1);
  assert.equal(liste.takipler[0].sorguYuku, 1);

  // Y-1: eşik değişince takip aynı kalır; Y-2: kalkış değişince pencere sürümü artar
  const duzen1 = await (await istek(`/api/takipler/${takip.kimlik}`, { yontem: "PUT", cerez, govde: ornekTakip({ tetikler: { esik: { acik: true, tutar: 1200 } } }) })).json();
  assert.equal(duzen1.takip.tetikler.esik.tutar, 1200);
  assert.equal(duzen1.takip.pencereSurumu, 1);
  const duzen2 = await (await istek(`/api/takipler/${takip.kimlik}`, { yontem: "PUT", cerez, govde: ornekTakip({ kalkis: ["IST", "SAW"] }) })).json();
  assert.deepEqual(duzen2.takip.kalkis, ["IST", "SAW"]);
  assert.equal(duzen2.takip.pencereSurumu, 2);

  assert.equal((await (await istek(`/api/takipler/${takip.kimlik}/duraklat`, { yontem: "POST", cerez, govde: {} })).json()).takip.durum, "duraklatildi");
  assert.equal((await istek(`/api/takipler/${takip.kimlik}/duraklat`, { yontem: "POST", cerez, govde: {} })).status, 409);
  assert.equal((await (await istek(`/api/takipler/${takip.kimlik}/surdur`, { yontem: "POST", cerez, govde: {} })).json()).takip.durum, "etkin");

  const kopya = await (await istek(`/api/takipler/${takip.kimlik}/cogalt`, { yontem: "POST", cerez, govde: {} })).json();
  assert.notEqual(kopya.takip.kimlik, takip.kimlik);
  assert.equal(kopya.takip.durum, "duraklatildi");
  assert.match(kopya.takip.ad, /\(kopya\)$/);

  assert.equal((await istek(`/api/takipler/${takip.kimlik}`, { yontem: "DELETE", cerez })).status, 200);
  assert.equal((await istek(`/api/takipler/${takip.kimlik}`, { cerez })).status, 404);
  assert.equal((await (await istek("/api/takipler", { cerez })).json()).takipler.length, 1);
});

test("sunucu girdiyi yeniden doğrular: liste dışı kod, bozuk JSON ve SQL denemesi", async () => {
  const { istek, girisYap, env } = await ortamKur();
  const cerez = await girisYap();
  const kotu = await istek("/api/takipler", { yontem: "POST", cerez, govde: ornekTakip({ kalkis: ["XXX"] }) });
  assert.equal(kotu.status, 422);
  assert.ok((await kotu.json()).hatalar.kalkis);
  assert.equal((await istek("/api/takipler", { yontem: "POST", cerez, govde: "{bozuk" })).status, 400);
  assert.equal((await istek("/api/takipler", { yontem: "POST", cerez, govde: "[1,2]" })).status, 400);
  const sql = "x'); DROP TABLE takip; --";
  const y = await istek("/api/takipler", { yontem: "POST", cerez, govde: ornekTakip({ ad: sql }) });
  assert.equal(y.status, 201);
  assert.equal((await y.json()).takip.ad, sql);
  assert.equal(env.DB.ham.prepare("SELECT COUNT(*) AS n FROM takip").get().n, 1);
  assert.equal((await istek("/api/takipler/'%20OR%201=1--", { cerez })).status, 404);
});

test("P-8: en fazla 50 etkin takip", async () => {
  const { istek, girisYap, env } = await ortamKur();
  const cerez = await girisYap();
  const ilk = await (await istek("/api/takipler", { yontem: "POST", cerez, govde: ornekTakip() })).json();
  env.DB.ham.exec(`INSERT INTO takip (kimlik, ad, tur, kalkis, varis, yon, tarih, suzgecler, tetikler, kanallar, olusturma, guncelleme)
    WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 49)
    SELECT printf('%08x', n), 'x', tur, kalkis, varis, yon, tarih, suzgecler, tetikler, kanallar, olusturma, guncelleme FROM takip, s WHERE kimlik = '${ilk.takip.kimlik}'`);
  assert.equal((await istek("/api/takipler", { yontem: "POST", cerez, govde: ornekTakip() })).status, 409);
});

test("ayarlar okunur ve doğrulanarak yazılır", async () => {
  const { istek, girisYap } = await ortamKur();
  const cerez = await girisYap();
  const ilk = await (await istek("/api/ayarlar", { cerez })).json();
  assert.deepEqual(ilk.ayarlar, { varsayilan_esik: 1500, gunluk_sinir: 10, varsayilan_kanallar: ["telegram", "eposta"], kurulu_kanallar: null });
  assert.equal((await istek("/api/ayarlar", { yontem: "PUT", cerez, govde: { gunluk_sinir: 99 } })).status, 422);
  const yeni = await (await istek("/api/ayarlar", { yontem: "PUT", cerez, govde: { varsayilan_esik: 2000, varsayilan_kanallar: ["telegram"], kurulu_kanallar: ["x"] } })).json();
  assert.equal(yeni.ayarlar.varsayilan_esik, 2000);
  assert.deepEqual(yeni.ayarlar.varsayilan_kanallar, ["telegram"]);
  assert.equal(yeni.ayarlar.kurulu_kanallar, null);  // panelden değiştirilemez
});

test("radar anahtarı olmadan /api/ic/* 401 döner; oturum çerezi de yetmez", async () => {
  const { istek, girisYap, env } = await ortamKur();
  const cerez = await girisYap();
  for (const [yol, yontem] of [["/api/ic/takipler", "GET"], ["/api/ic/sonuc", "POST"], ["/api/ic/olmayan", "GET"]]) {
    const govde = yontem === "POST" ? {} : undefined;
    assert.equal((await istek(yol, { yontem, govde })).status, 401, yol);
    assert.equal((await istek(yol, { yontem, govde, cerez })).status, 401, yol + " çerezle");
    assert.equal((await istek(yol, { yontem, govde, basliklar: { authorization: "Bearer yanlis-anahtar" } })).status, 401, yol + " yanlış anahtar");
    assert.equal((await istek(yol, { yontem, govde, basliklar: { authorization: env.RADAR_API_TOKEN } })).status, 401, yol + " Bearer'sız");
  }
  const { istek: istek2 } = await ortamKur({ RADAR_API_TOKEN: "" });
  assert.equal((await istek2("/api/ic/takipler", { basliklar: { authorization: "Bearer " } })).status, 401);
  const { istek: istek3 } = await ortamKur({ RADAR_API_TOKEN: "kisa-anahtar" });
  assert.equal((await istek3("/api/ic/takipler", { basliklar: { authorization: "Bearer kisa-anahtar" } })).status, 401);
});

test("radar anahtarıyla etkin takipler okunur ve sonuçlar yazılır; radar anahtarı panel uçlarını açmaz", async () => {
  const { istek, girisYap, env } = await ortamKur();
  const cerez = await girisYap();
  const yetki = { authorization: "Bearer " + env.RADAR_API_TOKEN };
  const a = (await (await istek("/api/takipler", { yontem: "POST", cerez, govde: ornekTakip() })).json()).takip;
  const b = (await (await istek("/api/takipler", { yontem: "POST", cerez, govde: ornekTakip({ kalkis: ["IST"] }) })).json()).takip;
  await istek(`/api/takipler/${b.kimlik}/duraklat`, { yontem: "POST", cerez, govde: {} });

  const oku = await (await istek("/api/ic/takipler", { basliklar: yetki })).json();
  assert.deepEqual(oku.takipler.map((t) => t.kimlik), [a.kimlik]);  // Y-3: duraklatılan sorgulanmaz
  assert.ok(oku.takipler[0].pencere.bas && oku.ayarlar);
  assert.equal((await istek("/api/takipler", { basliklar: yetki })).status, 401);

  const yaz = await istek("/api/ic/sonuc", { yontem: "POST", basliklar: yetki, govde: {
    tur: { durum: "tamam", tetik: "zamanlayici", sure_sn: 12.5, takip: 1, sorgu: 1, sorgu_hata: 0, gozlem: 2, firsat: 1, bildirim_hata: 0, butce_kalan: 59 },
    kanallar: ["telegram", "eposta", "uydurma"],
    gozlemler: [
      { kalkis: "SAW", varis: "ERZ", gidis: "2026-12-07", fiyat: 1249, havayolu: "PC", ucus_no: "2554", aktarma: 0, bagaj: "0PC", kaynak: "travelpayouts", gorulme: "2026-11-17T10:00:00Z", baglanti: "https://ornek.com/x" },
      { kalkis: "SAW", varis: "ERZ", gidis: "2026-12-08", fiyat: 1310, kaynak: "travelpayouts", baglanti: "javascript:alert(1)" },
      { kalkis: "'; DROP", varis: "ERZ", gidis: "2026-12-08", fiyat: 1 },
    ],
    firsatlar: [{ takip: a.kimlik, anahtar: `${a.kimlik}|SAW|ERZ|2026-12-07`, fiyat: 1249, tetikler: ["esik"] }],
    gonderimler: [{ anahtar: `${a.kimlik}|SAW|ERZ|2026-12-07`, kanal: "telegram", durum: "gonderildi" }, { anahtar: "x", kanal: "sms" }],
    taramalar: [{ takip: a.kimlik, son_fiyat: 1249 }],
    kaynaklar: [{ kaynak: "travelpayouts", durum: "tamam" }],
  } });
  assert.equal(yaz.status, 200);
  const db = env.DB.ham;
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM gozlem").get().n, 2);
  assert.equal(db.prepare("SELECT baglanti FROM gozlem WHERE gidis = '2026-12-08'").get().baglanti, null);  // yalnızca https
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM gonderim").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM takip").get().n, 2);

  const durum = await (await istek("/api/durum", { cerez })).json();
  assert.equal(durum.sonTur.durum, "tamam");
  assert.deepEqual(durum.kuruluKanallar, ["telegram", "eposta"]);
  const liste = await (await istek("/api/takipler", { cerez })).json();
  assert.equal(liste.takipler.find((t) => t.kimlik === a.kimlik).sonFiyat, 1249);
  assert.equal((await (await istek("/api/firsatlar", { cerez })).json()).firsatlar.length, 1);
  // Kurulu kanal listesi geldikten sonra kurulu olmayan kanal seçilemez
  assert.equal((await istek("/api/takipler", { yontem: "POST", cerez, govde: ornekTakip({ kanallar: ["whatsapp"] }) })).status, 422);
});

test("her yanıtta güvenlik başlıkları vardır; API yanıtları önbelleğe alınmaz", async () => {
  const { istek, girisYap } = await ortamKur();
  const cerez = await girisYap();
  for (const y of [await istek("/giris"), await istek("/api/takipler"), await istek("/api/takipler", { cerez }), await istek("/", { cerez }), await istek("/"), await istek("/api/ic/takipler")]) {
    assert.match(y.headers.get("content-security-policy"), /default-src 'none'/);
    assert.ok(!/unsafe-inline|https?:/.test(y.headers.get("content-security-policy")));
    assert.match(y.headers.get("x-robots-tag"), /noindex/);
    assert.equal(y.headers.get("referrer-policy"), "no-referrer");
    assert.equal(y.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal((await istek("/api/takipler", { cerez })).headers.get("cache-control"), "no-store");
  assert.equal((await istek("/", { cerez })).status, 200);
});

test("çıkış çerezi siler", async () => {
  const { istek, girisYap } = await ortamKur();
  const cerez = await girisYap();
  const y = await istek("/api/cikis", { yontem: "POST", cerez, govde: {} });
  assert.equal(y.status, 200);
  assert.match(y.headers.get("set-cookie"), /Max-Age=0/);
});

test("düz HTTP isteği veri ya da hata ayrıntısı vermeden HTTPS'e yönlendirilir; yerel deneme adresi hariç", async () => {
  const { env } = await ortamKur();
  const acik = KOKEN.replace("https://", "http://");
  for (const yol of ["/", "/giris", "/api/takipler?x=1", "/api/ic/takipler", "/api/giris"]) {
    const y = await worker.fetch(new Request(acik + yol, { redirect: "manual" }), env);
    assert.equal(y.status, 308, yol);
    assert.equal(y.headers.get("location"), KOKEN + yol);
    assert.equal(await y.text(), "");
  }
  const yerel = await worker.fetch(new Request("http://127.0.0.1:8787/api/takipler"), env);
  assert.equal(yerel.status, 401);
});

test("radar gönderim kayıtlarını ve bugünkü bildirim sayılarını geri okur (B-1, B-2, B-4, B-7); S-4: aynı gözlem yinelenmez", async () => {
  const { istek, girisYap, env } = await ortamKur();
  const cerez = await girisYap();
  const yetki = { authorization: "Bearer " + env.RADAR_API_TOKEN };
  const a = (await (await istek("/api/takipler", { yontem: "POST", cerez, govde: ornekTakip() })).json()).takip;
  const anahtar = `${a.kimlik}|SAW|ERZ|2026-12-07`;
  const gozlem = { kalkis: "SAW", varis: "ERZ", gidis: "2026-12-07", fiyat: 1249, havayolu: "PC", kaynak: "travelpayouts" };
  const govde = { gozlemler: [gozlem], gonderimler: [{ anahtar, kanal: "telegram", durum: "gonderildi", fiyat: 1249 }, { anahtar, kanal: "eposta", durum: "hata", fiyat: 1249 }] };
  assert.equal((await istek("/api/ic/sonuc", { yontem: "POST", basliklar: yetki, govde })).status, 200);
  assert.equal((await istek("/api/ic/sonuc", { yontem: "POST", basliklar: yetki, govde: { gozlemler: [gozlem, { ...gozlem, fiyat: 1199 }] } })).status, 200);
  assert.equal(env.DB.ham.prepare("SELECT COUNT(*) AS n FROM gozlem").get().n, 2);  // aynı fiyat yinelenmedi, yeni fiyat yazıldı

  const oku = await (await istek("/api/ic/takipler", { basliklar: yetki })).json();
  const tg = oku.gonderimler.find((g) => g.kanal === "telegram");
  assert.deepEqual({ anahtar: tg.anahtar, durum: tg.durum, fiyat: tg.fiyat }, { anahtar, durum: "gonderildi", fiyat: 1249 });
  assert.equal(oku.gonderimler.find((g) => g.kanal === "eposta").durum, "hata");
  assert.deepEqual(oku.bildirimSayilari, { [a.kimlik]: 1 });

  // Duraklatılan takibin gönderim kayıtları radara verilmez
  await istek(`/api/takipler/${a.kimlik}/duraklat`, { yontem: "POST", cerez, govde: {} });
  assert.equal((await (await istek("/api/ic/takipler", { basliklar: yetki })).json()).gonderimler.length, 0);
});

test("S-1, S-3 ve 7.10: eski gözlemler, eski gönderimler ve 30 günü geçmiş silinmiş takipler temizlenir", async () => {
  const { istek, girisYap, env } = await ortamKur();
  const cerez = await girisYap();
  const yetki = { authorization: "Bearer " + env.RADAR_API_TOKEN };
  const a = (await (await istek("/api/takipler", { yontem: "POST", cerez, govde: ornekTakip() })).json()).takip;
  await istek(`/api/takipler/${a.kimlik}`, { yontem: "DELETE", cerez });
  const db = env.DB.ham;
  db.exec(`UPDATE takip SET silinme = '2026-01-01T00:00:00Z';
    INSERT INTO gozlem (kalkis, varis, gidis, fiyat, kaynak, okunma) VALUES ('SAW', 'ERZ', '2026-01-10', 900, 'x', '2026-01-01T00:00:00Z');
    INSERT INTO gonderim (anahtar, kanal, durum, zaman) VALUES ('eski', 'telegram', 'gonderildi', '2026-01-01T00:00:00Z');`);
  assert.equal((await istek("/api/ic/sonuc", { yontem: "POST", basliklar: yetki, govde: {} })).status, 200);
  for (const tablo of ["takip", "gozlem", "gonderim"]) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${tablo}`).get().n, 0, tablo);
});
