// Takip tanımının doğrulaması, düz Türkçe özeti ve tahmini sorgu yükü.
// Aynı dosyayı hem panel (tarayıcı) hem kasa (sunucu) kullanır; belirleyici olan sunucudaki doğrulamadır.

export const SINIR = { etkinTakip: 50, kalkis: 4, varis: 4, ulke: 10, turButcesi: 60, ileriGun: 330 };
export const TURLER = ["butce", "rota", "gidis-donus", "donem", "kampanya"];
export const TUR_ADI = { butce: "Bütçe", rota: "Rota", "gidis-donus": "Gidiş-dönüş", donem: "Dönem", kampanya: "Kampanya" };
export const KAPSAMLAR = ["havalimani", "yurt-ici", "yurt-disi", "ulke", "her-yer"];
export const KANALLAR = ["telegram", "whatsapp", "eposta"];
export const KANAL_ADI = { telegram: "Telegram", whatsapp: "WhatsApp", eposta: "e-posta" };
export const AKTARMALAR = ["farketmez", "aktarmasiz", "en-fazla-1"];
export const VARSAYILAN = { esik: 1500, donemGun: 30, dususYuzde: 20, pencere: 90, gunlukSinir: 10, kanallar: ["telegram", "eposta"] };
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

// ---------------------------------------------------------------- tarih yardımcıları (hepsi UTC gün hesabı)
export const tarihMi = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"))
  && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
export const ayMi = (s) => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const gunEkle = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const gunFarki = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const aySonu = (ay) => { const [y, m] = ay.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export const bugunTR = (simdi = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(simdi);
const tarihYaz = (s) => { const [y, m, g] = s.split("-").map(Number); return `${g} ${AYLAR[m - 1]} ${y}`; };
const buyukBas = (m) => m.charAt(0).toLocaleUpperCase("tr") + m.slice(1);
const tl = (n) => new Intl.NumberFormat("tr-TR").format(n) + " TL";

const tam = (v, min, max) => { const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v; return Number.isInteger(n) && n >= min && n <= max ? n : null; };
const benzersiz = (dizi) => [...new Set(dizi)];
function kodlar(v, izinli, min, max) {
  if (!Array.isArray(v)) return null;
  const temiz = benzersiz(v.map((x) => String(x).trim().toUpperCase()));
  if (temiz.length < min || temiz.length > max || !temiz.every((k) => izinli.has(k))) return null;
  return temiz;
}

export function varsayilanTakip(ayarlar = {}) {
  return {
    ad: "", tur: "butce", kalkis: [], varis: { kapsam: "havalimani", havalimanlari: [], ulkeler: [] }, yon: "tek",
    tarih: { bicim: "surekli", baslangic: "", bitis: "", aylar: [], pencere: VARSAYILAN.pencere, gunler: [] },
    donus: { bicim: "kalis", baslangic: "", bitis: "", enAz: 2, enCok: 7, farkliHavalimani: false },
    yolcu: 1, aktarma: "farketmez", havayolu: { kip: "hepsi", kodlar: [] }, saat: null,
    tetikler: {
      esik: { acik: true, tutar: ayarlar.varsayilan_esik ?? VARSAYILAN.esik },
      donemDusugu: { acik: false, gun: VARSAYILAN.donemGun },
      dususYuzdesi: { acik: false, yuzde: VARSAYILAN.dususYuzde },
      takipDusugu: { acik: false },
    },
    kanallar: ayarlar.varsayilan_kanallar ?? VARSAYILAN.kanallar,
    gunlukSinir: ayarlar.gunluk_sinir ?? VARSAYILAN.gunlukSinir,
  };
}

/** Takibin gidiş tarihi penceresi: { bas, bit } (bugünden öncesi kırpılır). Kampanyada null. */
export function pencere(t, bugun) {
  if (t.tur === "kampanya") return null;
  let bas, bit;
  if (t.tarih.bicim === "aralik") { bas = t.tarih.baslangic; bit = t.tarih.bitis; }
  else if (t.tarih.bicim === "aylar") { const a = [...t.tarih.aylar].sort(); bas = a[0] + "-01"; bit = aySonu(a[a.length - 1]); }
  else { bas = bugun; bit = gunEkle(bugun, t.tarih.pencere - 1); }
  if (bas < bugun) bas = bugun;
  return { bas, bit };
}

/** Tur başına tahmini sorgu sayısı (P-3: 90 günlük dilim başına rota başına tek sorgu). */
export function sorguYuku(t, bugun) {
  const p = pencere(t, bugun);
  if (!p || p.bit < p.bas) return 0;
  let dilim = Math.max(1, Math.ceil((gunFarki(p.bas, p.bit) + 1) / 90));
  if (t.tarih.bicim === "aylar") dilim = Math.min(dilim, t.tarih.aylar.length);
  const k = t.varis.kapsam;
  const hedef = k === "havalimani" ? t.varis.havalimanlari.length : k === "ulke" ? t.varis.ulkeler.length * 2 : 3;
  return t.kalkis.length * hedef * dilim;
}

/**
 * Girdiyi doğrular ve temizlenmiş takibi döndürür.
 * ctx: { havalimanlari: Map(kod → {ad, sehir, ulke}), havayollari: Map(kod → ad), bugun: "YYYY-AA-GG", kanallar: [kurulu kanallar] }
 */
export function dogrula(g, ctx) {
  const h = {};
  const t = {};
  g = g && typeof g === "object" ? g : {};
  const { havalimanlari, havayollari, bugun } = ctx;
  const kurulu = ctx.kanallar && ctx.kanallar.length ? ctx.kanallar : KANALLAR;
  const ulkeler = new Set([...havalimanlari.values()].map((x) => x.ulke));
  const enIleri = gunEkle(bugun, SINIR.ileriGun);

  t.tur = TURLER.includes(g.tur) ? g.tur : null;
  if (!t.tur) h.tur = "Takip türü seçin.";
  const kampanya = t.tur === "kampanya";

  // Kalkış (H-1, H-2): her zaman havalimanı kodu; kampanyada isteğe bağlı süzgeç
  t.kalkis = kodlar(g.kalkis ?? [], havalimanlari, kampanya ? 0 : 1, SINIR.kalkis);
  if (!t.kalkis) { h.kalkis = `Listeden ${kampanya ? "en fazla" : "1–"}${SINIR.kalkis} kalkış havalimanı seçin.`; t.kalkis = []; }

  // Varış
  const v = g.varis && typeof g.varis === "object" ? g.varis : {};
  t.varis = { kapsam: KAPSAMLAR.includes(v.kapsam) ? v.kapsam : "havalimani", havalimanlari: [], ulkeler: [] };
  if (t.varis.kapsam === "havalimani") {
    const liste = kodlar(v.havalimanlari ?? [], havalimanlari, kampanya ? 0 : 1, SINIR.varis);
    if (!liste) h.varis = `Listeden ${kampanya ? "en fazla" : "1–"}${SINIR.varis} varış havalimanı seçin ya da geniş bir kapsam seçin.`;
    else if (liste.some((k) => t.kalkis.includes(k))) h.varis = "Kalkış ve varış aynı havalimanı olamaz.";
    else t.varis.havalimanlari = liste;
  } else if (t.varis.kapsam === "ulke") {
    const liste = kodlar(v.ulkeler ?? [], ulkeler, 1, SINIR.ulke);
    if (!liste) h.varis = `Listeden 1–${SINIR.ulke} ülke seçin.`; else t.varis.ulkeler = liste;
  }
  if (["rota", "gidis-donus"].includes(t.tur) && t.varis.kapsam !== "havalimani") h.varis = "Bu takip türünde varış havalimanı seçilmelidir.";

  // Yön
  t.yon = t.tur === "gidis-donus" ? "gidis-donus" : ["tek", "gidis-donus"].includes(g.yon) ? g.yon : "tek";

  // Tarih (T-2, T-3, T-4)
  const tr = g.tarih && typeof g.tarih === "object" ? g.tarih : {};
  t.tarih = { bicim: ["aralik", "aylar", "surekli"].includes(tr.bicim) ? tr.bicim : "surekli", baslangic: "", bitis: "", aylar: [], pencere: VARSAYILAN.pencere, gunler: [] };
  if (!kampanya) {
    if (t.tarih.bicim === "aralik") {
      if (!tarihMi(tr.baslangic) || !tarihMi(tr.bitis)) h.tarih = "Gidiş için başlangıç ve bitiş günü seçin.";
      else if (tr.bitis < tr.baslangic) h.tarih = "Bitiş günü başlangıçtan önce olamaz.";
      else if (tr.bitis < bugun) h.tarih = "Tarih aralığı geçmişte kalıyor.";
      else if (tr.bitis > enIleri) h.tarih = `En fazla ${SINIR.ileriGun} gün ilerisi izlenebilir.`;
      else { t.tarih.baslangic = tr.baslangic; t.tarih.bitis = tr.bitis; }
    } else if (t.tarih.bicim === "aylar") {
      const aylar = Array.isArray(tr.aylar) ? benzersiz(tr.aylar.map(String)).sort() : [];
      if (!aylar.length || aylar.length > 12 || !aylar.every(ayMi)) h.tarih = "Bir ya da birkaç ay seçin.";
      else if (aylar.some((a) => a < bugun.slice(0, 7))) h.tarih = "Geçmiş ay seçilemez.";
      else if (aylar.some((a) => a + "-01" > enIleri)) h.tarih = `En fazla ${SINIR.ileriGun} gün ilerisi izlenebilir.`;
      else t.tarih.aylar = aylar;
    } else {
      const p = tam(tr.pencere ?? VARSAYILAN.pencere, 7, SINIR.ileriGun);
      if (p === null) h.tarih = `Sürekli pencere 7–${SINIR.ileriGun} gün olmalı.`; else t.tarih.pencere = p;
    }
    const gunler = Array.isArray(tr.gunler) ? benzersiz(tr.gunler.map(Number)).sort() : [];
    if (!gunler.every((x) => Number.isInteger(x) && x >= 1 && x <= 7)) h.gunler = "Haftanın günleri geçersiz.";
    else t.tarih.gunler = gunler.length === 7 ? [] : gunler;
  }

  // Dönüş (T-5, H-6)
  t.donus = null;
  if (!kampanya && t.yon === "gidis-donus") {
    const d = g.donus && typeof g.donus === "object" ? g.donus : {};
    t.donus = { bicim: d.bicim === "aralik" ? "aralik" : "kalis", baslangic: "", bitis: "", enAz: 0, enCok: 0, farkliHavalimani: d.farkliHavalimani === true };
    if (t.donus.bicim === "aralik") {
      const gidisBas = pencereGuvenli(t, bugun)?.bas ?? bugun;
      if (!tarihMi(d.baslangic) || !tarihMi(d.bitis)) h.donus = "Dönüş için başlangıç ve bitiş günü seçin.";
      else if (d.bitis < d.baslangic) h.donus = "Dönüş bitişi başlangıcından önce olamaz.";
      else if (d.baslangic < gidisBas) h.donus = "Dönüş, gidiş başlangıcından önce olamaz.";
      else if (d.bitis > gunEkle(bugun, SINIR.ileriGun + 60)) h.donus = "Dönüş tarihi çok ileride.";
      else { t.donus.baslangic = d.baslangic; t.donus.bitis = d.bitis; }
    } else {
      const az = tam(d.enAz, 0, 60), cok = tam(d.enCok, 0, 60);
      if (az === null || cok === null) h.donus = "Kalış süresi 0–60 gece olmalı.";
      else if (az > cok) h.donus = "En az kalış, en çok kalıştan büyük olamaz.";
      else { t.donus.enAz = az; t.donus.enCok = cok; }
    }
  }

  // Yolcu, aktarma, havayolu, saat (F-3, F-9, F-10, T-7)
  t.yolcu = tam(g.yolcu ?? 1, 1, 9);
  if (t.yolcu === null) { h.yolcu = "Yolcu sayısı 1–9 olmalı."; t.yolcu = 1; }
  t.aktarma = AKTARMALAR.includes(g.aktarma) ? g.aktarma : "farketmez";
  const hy = g.havayolu && typeof g.havayolu === "object" ? g.havayolu : {};
  t.havayolu = { kip: ["hepsi", "dahil", "haric"].includes(hy.kip) ? hy.kip : "hepsi", kodlar: [] };
  if (t.havayolu.kip !== "hepsi") {
    const liste = kodlar(hy.kodlar ?? [], havayollari, 1, 20);
    if (!liste) h.havayolu = "Listeden en az bir havayolu seçin."; else t.havayolu.kodlar = liste;
  }
  t.saat = null;
  if (g.saat && typeof g.saat === "object" && (g.saat.bas || g.saat.bit)) {
    const saatMi = (x) => typeof x === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
    if (!saatMi(g.saat.bas) || !saatMi(g.saat.bit)) h.saat = "Kalkış saati aralığı SS:DD biçiminde olmalı.";
    else if (!(g.saat.bas === "00:00" && g.saat.bit === "23:59")) t.saat = { bas: g.saat.bas, bit: g.saat.bit };
  }

  // Tetikler (7.6)
  const te = g.tetikler && typeof g.tetikler === "object" ? g.tetikler : {};
  const acik = (x) => !!(x && x.acik === true);
  t.tetikler = { esik: { acik: false, tutar: VARSAYILAN.esik }, donemDusugu: { acik: false, gun: VARSAYILAN.donemGun },
    dususYuzdesi: { acik: false, yuzde: VARSAYILAN.dususYuzde }, takipDusugu: { acik: false } };
  if (!kampanya) {
    if (acik(te.esik)) {
      const n = tam(te.esik.tutar, 100, 100000);
      if (n === null) h.esik = "Eşik 100–100.000 TL arasında tam sayı olmalı."; else t.tetikler.esik = { acik: true, tutar: n };
    }
    if (acik(te.donemDusugu)) {
      const n = tam(te.donemDusugu.gun, 7, 180);
      if (n === null) h.donemDusugu = "Dönem 7–180 gün olmalı."; else t.tetikler.donemDusugu = { acik: true, gun: n };
    }
    if (acik(te.dususYuzdesi)) {
      const n = tam(te.dususYuzdesi.yuzde, 5, 80);
      if (n === null) h.dususYuzdesi = "Düşüş yüzdesi 5–80 olmalı."; else t.tetikler.dususYuzdesi = { acik: true, yuzde: n };
    }
    if (acik(te.takipDusugu)) t.tetikler.takipDusugu = { acik: true };
    if (!Object.values(t.tetikler).some((x) => x.acik) && !h.esik && !h.donemDusugu && !h.dususYuzdesi) h.tetikler = "En az bir tetik seçin.";
  }

  // Kanallar ve günlük sınır (B-4, B-6)
  const kn = Array.isArray(g.kanallar) ? benzersiz(g.kanallar.map(String)) : [];
  if (!kn.length || !kn.every((k) => KANALLAR.includes(k))) { h.kanallar = "En az bir bildirim kanalı seçin."; t.kanallar = []; }
  else if (!kn.every((k) => kurulu.includes(k))) { h.kanallar = "Yalnızca kurulu kanallar seçilebilir."; t.kanallar = []; }
  else t.kanallar = KANALLAR.filter((k) => kn.includes(k));
  t.gunlukSinir = tam(g.gunlukSinir ?? VARSAYILAN.gunlukSinir, 1, 20);
  if (t.gunlukSinir === null) { h.gunlukSinir = "Günlük bildirim sınırı 1–20 olmalı."; t.gunlukSinir = VARSAYILAN.gunlukSinir; }

  // Ad: boşsa rotadan türetilir
  const ad = typeof g.ad === "string" ? g.ad.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  t.ad = ad || turetAd(t);
  if (t.ad.length < 1 || t.ad.length > 60) h.ad = "Ad 1–60 karakter olmalı.";

  // Sorgu yükü (P-7): tek takip tur bütçesinin yarısını aşamaz
  const temiz = Object.keys(h).length === 0;
  const yuk = temiz ? sorguYuku(t, bugun) : 0;
  if (temiz && yuk > SINIR.turButcesi / 2) {
    h.yuk = `Bu takip tur başına yaklaşık ${yuk} sorgu ister; sınır ${SINIR.turButcesi / 2}. Daha az havalimanı, daha dar bir tarih aralığı ya da belirli varış seçin.`;
  }
  return { tamam: Object.keys(h).length === 0, hatalar: h, takip: t, yuk };
}

function pencereGuvenli(t, bugun) { try { return h_pencere(t, bugun); } catch { return null; } }
function h_pencere(t, bugun) {
  if (t.tarih.bicim === "aralik" && !t.tarih.baslangic) return null;
  if (t.tarih.bicim === "aylar" && !t.tarih.aylar.length) return null;
  return pencere(t, bugun);
}

export function turetAd(t) {
  if (t.tur === "kampanya") return t.kalkis.length ? `Kampanyalar · ${t.kalkis.join(", ")}` : "Kampanyalar";
  const k = t.kalkis.join(", ") || "?";
  const v = t.varis.kapsam === "havalimani" ? t.varis.havalimanlari.join(", ") || "?"
    : t.varis.kapsam === "ulke" ? t.varis.ulkeler.join(", ") : { "yurt-ici": "yurt içi", "yurt-disi": "yurt dışı", "her-yer": "her yer" }[t.varis.kapsam];
  return `${k} → ${v}`.slice(0, 60);
}

/** "Bu takip şunu izleyecek" özeti. adlar: Map(kod → {ad, sehir, ulke}) */
export function ozet(t, adlar, bugun) {
  const hv = (k) => { const a = adlar.get(k); return a ? `${a.ad} (${k})` : k; };
  const liste = (d) => d.length <= 1 ? d.join("") : d.slice(0, -1).join(", ") + " ya da " + d[d.length - 1];
  const kanal = t.kanallar.map((k) => KANAL_ADI[k]).join(", ");
  if (t.tur === "kampanya") {
    const suz = t.kalkis.length ? `${liste(t.kalkis.map(hv))} kalkışlı rotaları içeren ` : "";
    return `Havayolları ${suz}yeni bir kampanya açtığında ${kanal} ile bildirir.`;
  }
  const varis = t.varis.kapsam === "havalimani" ? liste(t.varis.havalimanlari.map(hv)) + " varışlı"
    : t.varis.kapsam === "ulke" ? `${liste(t.varis.ulkeler)} ülkelerine giden`
    : { "yurt-ici": "yurt içi", "yurt-disi": "yurt dışı", "her-yer": "herhangi bir yere giden" }[t.varis.kapsam];
  let tarih;
  if (t.tarih.bicim === "aralik") tarih = `${tarihYaz(t.tarih.baslangic)} – ${tarihYaz(t.tarih.bitis)} arası`;
  else if (t.tarih.bicim === "aylar") tarih = t.tarih.aylar.map((a) => `${AYLAR[Number(a.slice(5)) - 1]} ${a.slice(0, 4)}`).join(", ") + " içinde";
  else tarih = `bugünden başlayarak önümüzdeki ${t.tarih.pencere} gün içinde`;
  if (t.tarih.gunler.length) tarih += ` (yalnızca ${t.tarih.gunler.map((x) => GUNLER[x - 1]).join(", ")} kalkışları)`;
  let yon = "tek yön";
  if (t.yon === "gidis-donus" && t.donus) {
    yon = t.donus.bicim === "aralik" ? `gidiş-dönüş (dönüş ${tarihYaz(t.donus.baslangic)} – ${tarihYaz(t.donus.bitis)} arası)`
      : `gidiş-dönüş (${t.donus.enAz}–${t.donus.enCok} gece kalış)`;
    if (t.donus.farkliHavalimani) yon += ", farklı havalimanına dönüş olabilir";
  }
  const kosul = [];
  if (t.tetikler.esik.acik) kosul.push(`kişi başı ${t.yon === "gidis-donus" ? "toplam " : ""}fiyat ${tl(t.tetikler.esik.tutar)} ya da altına inince`);
  if (t.tetikler.donemDusugu.acik) kosul.push(`son ${t.tetikler.donemDusugu.gun} günün en düşüğü görülünce`);
  if (t.tetikler.dususYuzdesi.acik) kosul.push(`fiyat son 14 günün ortancasından en az %${t.tetikler.dususYuzdesi.yuzde} düşünce`);
  if (t.tetikler.takipDusugu.acik) kosul.push("takip başladığından beri en düşük fiyat görülünce");
  const suz = [];
  if (t.aktarma === "aktarmasiz") suz.push("yalnızca aktarmasız"); else if (t.aktarma === "en-fazla-1") suz.push("en fazla 1 aktarmalı");
  if (t.havayolu.kip === "dahil") suz.push(`yalnızca ${t.havayolu.kodlar.join(", ")}`);
  if (t.havayolu.kip === "haric") suz.push(`${t.havayolu.kodlar.join(", ")} hariç`);
  if (t.saat) suz.push(`${t.saat.bas}–${t.saat.bit} arası kalkan`);
  if (t.yolcu > 1) suz.push(`${t.yolcu} yolcu için`);
  const yuk = bugun ? sorguYuku(t, bugun) : null;
  return `${liste(t.kalkis.map(hv))} kalkışlı, ${varis}, ${yon} uçuşları ${tarih} izler` + (suz.length ? ` (${suz.join("; ")})` : "") +
    `. ${buyukBas(kosul.join(" ya da "))} ${kanal} ile bildirir; günde en fazla ${t.gunlukSinir} bildirim.` +
    (yuk !== null ? ` Tur başına yaklaşık ${yuk} sorgu kullanır.` : "");
}
