// Tek kullanıcılı giriş: parola özeti doğrulama, imzalı oturum çerezi, hatalı deneme sınırı.
// Parolanın kendisi hiçbir yerde saklanmaz; worker yalnızca özetini (PANEL_PAROLA_OZETI) bilir.

const kodlayici = new TextEncoder();
export const OTURUM_SURESI_SN = 7 * 24 * 3600;
export const DENEME_PENCERESI_SN = 15 * 60;
export const DENEME_SINIRI = 5;
export const CEREZ = "oturum";

const b64 = (bayt) => btoa(String.fromCharCode(...new Uint8Array(bayt)));
const b64coz = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bayt) => b64(bayt).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sha256(metin) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", kodlayici.encode(metin)));
}

/** Sabit süreli karşılaştırma: iki değer önce özetlenir, sonra bayt bayt karşılaştırılır. */
export async function esitMi(a, b) {
  const [x, y] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  let fark = 0;
  for (let i = 0; i < x.length; i++) fark |= x[i] ^ y[i];
  return fark === 0;
}

/** Özet biçimi: pbkdf2-sha256$<tur>$<tuz b64>$<özet b64> */
export async function parolaOzeti(parola, tuz = crypto.getRandomValues(new Uint8Array(16)), tur = 100000) {
  const anahtar = await crypto.subtle.importKey("raw", kodlayici.encode(parola), "PBKDF2", false, ["deriveBits"]);
  const bit = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: tuz, iterations: tur }, anahtar, 256);
  return `pbkdf2-sha256$${tur}$${b64(tuz)}$${b64(bit)}`;
}

export async function parolaDogru(parola, kayitli) {
  const parca = String(kayitli || "").split("$");
  if (parca.length !== 4 || parca[0] !== "pbkdf2-sha256") return false;
  const tur = Number(parca[1]);
  if (!Number.isInteger(tur) || tur < 10000 || tur > 100000) return false;
  let tuz;
  try { tuz = b64coz(parca[2]); } catch { return false; }
  const hesap = await parolaOzeti(String(parola), tuz, tur);
  return esitMi(hesap, kayitli);
}

async function imza(env, metin) {
  const anahtar = await crypto.subtle.importKey("raw", kodlayici.encode(env.OTURUM_ANAHTARI), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", anahtar, kodlayici.encode(metin)));
}

export const kurulumTamam = (env) => typeof env.OTURUM_ANAHTARI === "string" && env.OTURUM_ANAHTARI.length >= 32
  && typeof env.PANEL_PAROLA_OZETI === "string" && env.PANEL_PAROLA_OZETI.startsWith("pbkdf2-sha256$");

export async function cerezUret(env, simdiSn) {
  const bitis = simdiSn + OTURUM_SURESI_SN;
  const deger = `${bitis}.${await imza(env, "oturum|" + bitis)}`;
  return `${CEREZ}=${deger}; Path=/; Max-Age=${OTURUM_SURESI_SN}; HttpOnly; Secure; SameSite=Strict`;
}

export const cerezSil = () => `${CEREZ}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

export async function oturumGecerli(request, env, simdiSn) {
  if (!kurulumTamam(env)) return false;
  const baslik = request.headers.get("cookie") || "";
  const es = baslik.split(";").map((x) => x.trim()).find((x) => x.startsWith(CEREZ + "="));
  if (!es) return false;
  const [bitis, im] = es.slice(CEREZ.length + 1).split(".");
  const n = Number(bitis);
  if (!Number.isInteger(n) || n <= simdiSn || !im) return false;
  return esitMi(im, await imza(env, "oturum|" + n));
}

/** IP'nin kendisi saklanmaz; oturum anahtarıyla tuzlanmış özeti saklanır. */
export async function ipOzeti(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "yerel";
  return b64url(await sha256(`${env.OTURUM_ANAHTARI}|${ip}`)).slice(0, 32);
}

export async function denemeSayisi(db, ozet, simdiSn) {
  const satir = await db.prepare("SELECT COUNT(*) AS n FROM giris_deneme WHERE ip_ozeti = ?1 AND zaman > ?2")
    .bind(ozet, simdiSn - DENEME_PENCERESI_SN).first();
  return Number(satir?.n || 0);
}

export async function denemeKaydet(db, ozet, simdiSn) {
  await db.batch([
    db.prepare("INSERT INTO giris_deneme (ip_ozeti, zaman) VALUES (?1, ?2)").bind(ozet, simdiSn),
    db.prepare("DELETE FROM giris_deneme WHERE zaman < ?1").bind(simdiSn - 24 * 3600),
  ]);
}
