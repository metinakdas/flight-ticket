// Fırsatlar ekranının ve radarın kullandığı fırsat kayıtları.
import test from "node:test";
import assert from "node:assert/strict";
import { ortamKur, ornekTakip } from "./yardimci.mjs";

async function kur() {
  const o = await ortamKur();
  const cerez = await o.girisYap();
  const yetki = { authorization: "Bearer " + o.env.RADAR_API_TOKEN };
  const takip = (await (await o.istek("/api/takipler", { yontem: "POST", cerez, govde: ornekTakip({ ad: "Erzurum" }) })).json()).takip;
  const anahtar = `${takip.kimlik}|SAW|ERZ|2026-12-07`;
  const ayrinti = { kalkis: "SAW", varis: "ERZ", gidis: "2026-12-07", fiyat: 1249, havayolu: "PC", ucus_no: "2554", aktarma: 0, bagaj: "yok",
    gorulme: "2026-11-17T10:00:00Z", baglanti: "https://www.aviasales.com/search/x" };
  const yaz = (govde) => o.istek("/api/ic/sonuc", { yontem: "POST", basliklar: yetki, govde });
  return { ...o, cerez, yetki, takip, anahtar, ayrinti, yaz };
}

test("B-14: kanal yokken yazılan fırsat panelde görünür ve gönderilmemiş olarak işaretlenir", async () => {
  const { istek, cerez, takip, anahtar, ayrinti, yaz } = await kur();
  assert.equal((await yaz({ tur: { durum: "tamam", sorgu: 1, gozlem: 1, firsat: 1 }, kanallar: [],
    firsatlar: [{ takip: takip.kimlik, anahtar, fiyat: 1249, tetikler: ["esik"], ayrinti }] })).status, 200);
  const { firsatlar } = await (await istek("/api/firsatlar", { cerez })).json();
  assert.equal(firsatlar.length, 1);
  const f = firsatlar[0];
  assert.equal(f.takip_adi, "Erzurum");
  assert.equal(f.fiyat, 1249);
  assert.deepEqual(f.tetikler, ["esik"]);
  assert.deepEqual(f.kanallar, []);
  assert.equal(f.ayrinti.ucus_no, "2554");
  assert.ok(f.ilk_gorulme && f.son_gorulme);

  const durum = await (await istek("/api/durum", { cerez })).json();
  assert.equal(durum.sonGunFirsat, 1);
  assert.equal(durum.sonTurlar.length, 1);
  assert.deepEqual(durum.kuruluKanallar, []);
});

test("fırsat yeniden görülünce ilk görülme anı korunur, fiyat güncellenir; gönderilen kanal fırsatta görünür", async () => {
  const { istek, cerez, yetki, takip, anahtar, ayrinti, yaz, env } = await kur();
  await yaz({ firsatlar: [{ takip: takip.kimlik, anahtar, fiyat: 1249, tetikler: ["esik"], ayrinti }] });
  env.DB.ham.exec("UPDATE firsat SET ilk_gorulme = '2026-11-10T00:00:00Z', son_gorulme = '2026-11-10T00:00:00Z'");
  await yaz({ firsatlar: [{ takip: takip.kimlik, anahtar, fiyat: 1199, tetikler: ["esik"], ayrinti: { ...ayrinti, fiyat: 1199 } }],
    gonderimler: [{ anahtar, kanal: "telegram", durum: "gonderildi", fiyat: 1199 }] });

  const radar = await (await istek("/api/ic/takipler", { basliklar: yetki })).json();
  assert.deepEqual(radar.firsatlar, [{ anahtar, fiyat: 1199, ilk_gorulme: "2026-11-10T00:00:00Z" }]);

  const { firsatlar } = await (await istek("/api/firsatlar", { cerez })).json();
  assert.equal(firsatlar.length, 1);
  assert.equal(firsatlar[0].fiyat, 1199);
  assert.deepEqual(firsatlar[0].kanallar, ["telegram"]);
});

test("silinen takibin fırsatları panelde görünmez; girişsiz fırsat ucu 401 döner", async () => {
  const { istek, cerez, takip, anahtar, ayrinti, yaz } = await kur();
  await yaz({ firsatlar: [{ takip: takip.kimlik, anahtar, fiyat: 1249, tetikler: ["esik"], ayrinti }] });
  await istek(`/api/takipler/${takip.kimlik}`, { yontem: "DELETE", cerez });
  assert.equal((await (await istek("/api/firsatlar", { cerez })).json()).firsatlar.length, 0);
  assert.equal((await istek("/api/firsatlar")).status, 401);
});
