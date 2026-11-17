// Parola sorusu: soru metni görünür, yazılan karakterler ekrana yansımaz.
import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { gizliSor } from "../araclar/gizli-sor.mjs";
import { envSatiriYaz } from "../araclar/gizliler.mjs";

test(".env yazımı yalnızca ilgili satırı ekler ya da değiştirir; diğer satırlara dokunmaz", () => {
  const LF = String.fromCharCode(10), CR = String.fromCharCode(13), BOM = String.fromCharCode(0xfeff);
  const once = ["# not", "A=1", "RADAR_API_TOKEN=eski", "B=2", ""].join(LF);
  assert.equal(envSatiriYaz(once, "RADAR_API_TOKEN", "yeni"), ["# not", "A=1", "RADAR_API_TOKEN=yeni", "B=2", ""].join(LF));
  assert.equal(envSatiriYaz(["A=1", "B=2", ""].join(LF), "RADAR_API_TOKEN", "x"), ["A=1", "B=2", "RADAR_API_TOKEN=x", ""].join(LF));
  assert.equal(envSatiriYaz(BOM + ["A=1", "B=2"].join(CR + LF), "C", "3"), ["A=1", "B=2", "C=3", ""].join(LF));
  assert.equal(envSatiriYaz("", "C", "3"), "C=3" + LF);
});

const ENTER = String.fromCharCode(13);
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function ekranKur() {
  const girdi = new PassThrough();
  const cikti = new PassThrough();
  const ekran = { metin: "" };
  cikti.on("data", (d) => { ekran.metin += d.toString("utf8"); });
  return { girdi, cikti, ekran };
}

test("soru metni ekrana yazılır, yanıtın karakterleri yazılmaz", async () => {
  const { girdi, cikti, ekran } = ekranKur();
  const bekleyen = gizliSor("Panel parolası: ", girdi, cikti);
  await bekle(20);
  assert.ok(ekran.metin.includes("Panel parolası: "), "soru görünmeli: " + JSON.stringify(ekran.metin));
  for (const harf of "cok-gizli-deger") girdi.write(harf);
  girdi.write(ENTER);
  assert.equal(await bekleyen, "cok-gizli-deger");
  assert.ok(!ekran.metin.includes("gizli") && !ekran.metin.includes("deger"), "yanıt ekrana yansımamalı: " + JSON.stringify(ekran.metin));
  assert.ok(ekran.metin.endsWith(String.fromCharCode(10)));
});

test("art arda iki soru da görünür", async () => {
  const { girdi, cikti, ekran } = ekranKur();
  const ilk = gizliSor("Birinci: ", girdi, cikti);
  await bekle(20);
  girdi.write("aaa" + ENTER);
  assert.equal(await ilk, "aaa");
  const ikinci = gizliSor("İkinci: ", girdi, cikti);
  await bekle(20);
  girdi.write("bbb" + ENTER);
  assert.equal(await ikinci, "bbb");
  assert.ok(ekran.metin.includes("Birinci: ") && ekran.metin.includes("İkinci: "), JSON.stringify(ekran.metin));
  assert.ok(!ekran.metin.includes("aaa") && !ekran.metin.includes("bbb"), JSON.stringify(ekran.metin));
});
