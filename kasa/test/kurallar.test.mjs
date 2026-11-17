// Takip formu kuralları (MIMARI.md 7. ve 8.2 bölümleri). Test adlarında kural kimliği geçer.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dogrula, ozet, sorguYuku, pencere, gunEkle, bugunTR, SINIR } from "../../panel/ortak/kurallar.js";
import { ornekTakip } from "./yardimci.mjs";

const oku = (ad) => JSON.parse(readFileSync(new URL(`../../radar/veri/${ad}.json`, import.meta.url), "utf8"));
const BUGUN = "2026-11-17";
const ctx = { havalimanlari: new Map(oku("havalimanlari").map((x) => [x.kod, x])), havayollari: new Map(oku("havayollari").map((x) => [x.kod, x.ad])), bugun: BUGUN };
const d = (ek) => dogrula(ornekTakip(ek), ctx);

test("geçerli rota takibi kabul edilir ve ad rotadan türetilir", () => {
  const s = d();
  assert.equal(s.tamam, true, JSON.stringify(s.hatalar));
  assert.equal(s.takip.ad, "SAW → ERZ");
  assert.deepEqual(s.takip.kanallar, ["telegram", "eposta"]);
});

test("H-1 H-8: kalkış yalnızca listedeki havalimanı kodu olabilir; şehir adı ya da uydurma kod reddedilir", () => {
  assert.ok(d({ kalkis: ["İstanbul"] }).hatalar.kalkis);
  assert.ok(d({ kalkis: ["XXX"] }).hatalar.kalkis);
  assert.ok(d({ kalkis: [] }).hatalar.kalkis);
  assert.deepEqual(d({ kalkis: ["ist", "saw"] }).takip.kalkis, ["IST", "SAW"]);
});

test("H-2: IST ve SAW ayrı ayrı saklanır; liste kendiliğinden genişlemez", () => {
  assert.deepEqual(d({ kalkis: ["IST"] }).takip.kalkis, ["IST"]);
});

test("P-8: en fazla 4 kalkış ve 4 belirli varış", () => {
  assert.ok(d({ kalkis: ["IST", "SAW", "ESB", "ADB", "AYT"] }).hatalar.kalkis);
  assert.ok(d({ varis: { kapsam: "havalimani", havalimanlari: ["ERZ", "TZX", "GZT", "VAN", "KSY"] } }).hatalar.varis);
});

test("H-5: varış da listeden doğrulanır; kalkışla aynı olamaz; ülke kapsamı listeden", () => {
  assert.ok(d({ varis: { kapsam: "havalimani", havalimanlari: ["QQQ"] } }).hatalar.varis);
  assert.ok(d({ varis: { kapsam: "havalimani", havalimanlari: ["SAW"] } }).hatalar.varis);
  assert.equal(d({ tur: "butce", varis: { kapsam: "ulke", ulkeler: ["DE", "NL"] } }).tamam, true);
  assert.ok(d({ tur: "butce", varis: { kapsam: "ulke", ulkeler: ["ZZ"] } }).hatalar.varis);
  assert.ok(d({ tur: "rota", varis: { kapsam: "her-yer" } }).hatalar.varis);
});

test("T-2 T-3: geçmiş aralık ve geçmiş ay reddedilir; en fazla 330 gün ileri", () => {
  assert.ok(d({ tarih: { bicim: "aralik", baslangic: "2026-10-01", bitis: "2026-10-10" } }).hatalar.tarih);
  assert.ok(d({ tarih: { bicim: "aralik", baslangic: "2026-12-10", bitis: "2026-12-01" } }).hatalar.tarih);
  assert.ok(d({ tarih: { bicim: "aralik", baslangic: "2026-12-01", bitis: gunEkle(BUGUN, 331) } }).hatalar.tarih);
  assert.ok(d({ tarih: { bicim: "aylar", aylar: ["2026-10"] } }).hatalar.tarih);
  assert.ok(d({ tarih: { bicim: "aylar", aylar: [] } }).hatalar.tarih);
  assert.ok(d({ tarih: { bicim: "aralik", baslangic: "2026-02-30", bitis: "2026-12-01" } }).hatalar.tarih);
  assert.equal(d({ tarih: { bicim: "aylar", aylar: ["2027-04", "2027-05", "2027-06"] } }).tamam, true);
  assert.ok(d({ tarih: { bicim: "surekli", pencere: 6 } }).hatalar.tarih);
  assert.ok(d({ tarih: { bicim: "surekli", pencere: 331 } }).hatalar.tarih);
});

test("T-2: aralığın geçmişte kalan kısmı kırpılır, kalan kısım izlenir", () => {
  const s = d({ tarih: { bicim: "aralik", baslangic: "2026-11-01", bitis: "2026-11-30" } });
  assert.equal(s.tamam, true);
  assert.deepEqual(pencere(s.takip, BUGUN), { bas: BUGUN, bit: "2026-11-30" });
});

test("T-4: haftanın günleri 1–7; yedisi birden seçilirse 'her gün' sayılır", () => {
  assert.deepEqual(d({ tarih: { bicim: "surekli", pencere: 90, gunler: [5] } }).takip.tarih.gunler, [5]);
  assert.deepEqual(d({ tarih: { bicim: "surekli", pencere: 90, gunler: [1, 2, 3, 4, 5, 6, 7] } }).takip.tarih.gunler, []);
  assert.ok(d({ tarih: { bicim: "surekli", pencere: 90, gunler: [8] } }).hatalar.gunler);
});

test("T-5: gidiş-dönüşte dönüş aralığı ya da kalış süresi; dönüş gidişten önce olamaz", () => {
  const gd = { tur: "gidis-donus", tarih: { bicim: "aralik", baslangic: "2027-05-10", bitis: "2027-05-15" } };
  assert.equal(d({ ...gd, donus: { bicim: "aralik", baslangic: "2027-05-18", bitis: "2027-05-22" } }).tamam, true);
  assert.ok(d({ ...gd, donus: { bicim: "aralik", baslangic: "2027-05-01", bitis: "2027-05-05" } }).hatalar.donus);
  assert.ok(d({ ...gd, donus: { bicim: "kalis", enAz: 9, enCok: 3 } }).hatalar.donus);
  assert.ok(d({ ...gd, donus: { bicim: "kalis", enAz: 0, enCok: 61 } }).hatalar.donus);
  const s = d({ ...gd, donus: { bicim: "kalis", enAz: 3, enCok: 7 } });
  assert.equal(s.tamam, true);
  assert.equal(s.takip.yon, "gidis-donus");
});

test("F-4 ve 7.6: eşik 100–100.000 TL; en az bir tetik; dönem 7–180; yüzde 5–80", () => {
  assert.ok(d({ tetikler: { esik: { acik: true, tutar: 99 } } }).hatalar.esik);
  assert.ok(d({ tetikler: { esik: { acik: true, tutar: 100001 } } }).hatalar.esik);
  assert.ok(d({ tetikler: { esik: { acik: true, tutar: "1500.5" } } }).hatalar.esik);
  assert.ok(d({ tetikler: {} }).hatalar.tetikler);
  assert.ok(d({ tetikler: { donemDusugu: { acik: true, gun: 6 } } }).hatalar.donemDusugu);
  assert.ok(d({ tetikler: { dususYuzdesi: { acik: true, yuzde: 81 } } }).hatalar.dususYuzdesi);
  assert.equal(d({ tetikler: { donemDusugu: { acik: true, gun: 30 }, dususYuzdesi: { acik: true, yuzde: 20 } } }).tamam, true);
});

test("F-9 F-10: aktarma seçenekleri; havayolu dahil ya da hariç listesi listeden doğrulanır", () => {
  assert.equal(d({ aktarma: "aktarmasiz" }).takip.aktarma, "aktarmasiz");
  assert.equal(d({ aktarma: "uydurma" }).takip.aktarma, "farketmez");
  assert.ok(d({ havayolu: { kip: "dahil", kodlar: [] } }).hatalar.havayolu);
  assert.ok(d({ havayolu: { kip: "haric", kodlar: ["ZZ"] } }).hatalar.havayolu);
  assert.deepEqual(d({ havayolu: { kip: "dahil", kodlar: ["pc", "VF"] } }).takip.havayolu, { kip: "dahil", kodlar: ["PC", "VF"] });
});

test("B-4 B-6: en az bir kanal, yalnızca kurulu kanallar; günlük sınır 1–20, varsayılan 10", () => {
  assert.ok(d({ kanallar: [] }).hatalar.kanallar);
  assert.ok(d({ kanallar: ["sms"] }).hatalar.kanallar);
  assert.ok(dogrula(ornekTakip({ kanallar: ["whatsapp"] }), { ...ctx, kanallar: ["telegram", "eposta"] }).hatalar.kanallar);
  assert.ok(d({ gunlukSinir: 21 }).hatalar.gunlukSinir);
  assert.equal(d({ gunlukSinir: undefined }).takip.gunlukSinir, 10);
});

test("F-3: yolcu sayısı 1–9", () => {
  assert.ok(d({ yolcu: 0 }).hatalar.yolcu);
  assert.ok(d({ yolcu: 10 }).hatalar.yolcu);
  assert.equal(d({ yolcu: 3 }).takip.yolcu, 3);
});

test("ad 1–60 karakter; denetim karakterleri temizlenir", () => {
  assert.ok(d({ ad: "x".repeat(61) }).hatalar.ad);
  assert.equal(d({ ad: "  Erzurum\u0000 bileti " }).takip.ad, "Erzurum  bileti");
});

test("P-7: tur bütçesinin yarısını aşan takip kaydedilmez ve nasıl daraltılacağı söylenir", () => {
  const genis = d({ tur: "butce", kalkis: ["IST", "SAW", "ESB", "ADB"], varis: { kapsam: "her-yer" }, tarih: { bicim: "surekli", pencere: 330 } });
  assert.equal(genis.tamam, false);
  assert.match(genis.hatalar.yuk, /sınır 30/);
  const dar = d({ tur: "butce", kalkis: ["IST", "SAW"], varis: { kapsam: "her-yer" }, tarih: { bicim: "surekli", pencere: 90 } });
  assert.equal(dar.tamam, true);
  assert.ok(sorguYuku(dar.takip, BUGUN) <= SINIR.turButcesi / 2);
});

test("kampanya takibinde tarih ve tetik aranmaz; kalkış süzgeci isteğe bağlıdır", () => {
  const s = dogrula({ tur: "kampanya", kanallar: ["telegram"] }, ctx);
  assert.equal(s.tamam, true, JSON.stringify(s.hatalar));
  assert.equal(s.takip.ad, "Kampanyalar");
});

test("özet düz Türkçe yazılır ve havalimanı adlarını içerir", () => {
  const metin = ozet(d().takip, ctx.havalimanlari, BUGUN);
  assert.match(metin, /Sabiha Gökçen \(SAW\) kalkışlı/);
  assert.match(metin, /Erzurum \(ERZ\) varışlı/);
  assert.match(metin, /1\.500 TL/);
  assert.match(metin, /Telegram, e-posta/);
});

test("T-1: bugün Türkiye saatine göre hesaplanır (gün dönümü sınırı)", () => {
  assert.equal(bugunTR(new Date("2026-11-17T20:59:59Z")), "2026-11-17");
  assert.equal(bugunTR(new Date("2026-11-17T21:00:00Z")), "2026-11-18");
});

test("bozuk girdi çökme yerine hata döndürür", () => {
  for (const g of [null, 5, "metin", [], { tur: "rota", kalkis: "IST", varis: 3, tarih: "x", tetikler: [], kanallar: {} }]) {
    assert.equal(dogrula(g, ctx).tamam, false);
  }
});
