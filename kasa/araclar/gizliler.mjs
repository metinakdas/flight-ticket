// Kasa worker'ının gizli değerlerini kurar. Kendi terminalinizde çalıştırın: node araclar/gizliler.mjs
//
// 1. Panel parolasını iki kez sorar (yazarken görünmez), özetini hesaplar; parolanın kendisi hiçbir yere yazılmaz.
// 2. Oturum anahtarını ve radar anahtarını rastgele üretir.
// 3. Üçünü `wrangler secret put` ile Cloudflare'e standart girdiden gönderir (komut satırına ve ekrana yazılmaz).
// 4. Radar anahtarını projenin .env dosyasına RADAR_API_TOKEN olarak yazar (radar aynı anahtarı kullanır).
//
// Yalnızca parolayı değiştirmek için:        node araclar/gizliler.mjs --yalnizca-parola
// Yalnızca radar anahtarını yenilemek için:  node araclar/gizliler.mjs --yalnizca-radar
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gizliSor } from "./gizli-sor.mjs";
import { parolaOzeti } from "../src/oturum.js";

const KASA = fileURLToPath(new URL("..", import.meta.url));
const ENV = fileURLToPath(new URL("../../.env", import.meta.url));
const SATIR_SONU = String.fromCharCode(10);
const SATIR_BASI = String.fromCharCode(13);
const BOM = String.fromCharCode(0xfeff);

function gizliYaz(ad, deger) {
  const s = spawnSync("npx", ["wrangler", "secret", "put", ad], { cwd: KASA, input: deger, shell: true, stdio: ["pipe", "inherit", "inherit"] });
  if (s.status !== 0) { console.error(`✗ ${ad} yazılamadı. Önce "npx wrangler login" ve "npx wrangler deploy" yapıldığından emin olun.`); process.exit(1); }
  console.log(`✓ ${ad} Cloudflare'e yazıldı`);
}

/** .env içinde yalnızca verilen anahtarın satırını ekler ya da değiştirir; diğer satırlara dokunmaz. */
export function envSatiriYaz(icerik, ad, deger) {
  const ham = icerik.startsWith(BOM) ? icerik.slice(1) : icerik;
  const satirlar = ham ? ham.split(SATIR_SONU).map((s) => (s.endsWith(SATIR_BASI) ? s.slice(0, -1) : s)) : [];
  while (satirlar.length && satirlar[satirlar.length - 1] === "") satirlar.pop();
  const i = satirlar.findIndex((s) => s.startsWith(ad + "="));
  if (i >= 0) satirlar[i] = `${ad}=${deger}`; else satirlar.push(`${ad}=${deger}`);
  return satirlar.join(SATIR_SONU) + SATIR_SONU;
}

function radarAnahtariYaz() {
  const radar = randomBytes(32).toString("hex");
  gizliYaz("RADAR_API_TOKEN", radar);
  writeFileSync(ENV, envSatiriYaz(existsSync(ENV) ? readFileSync(ENV, "utf8") : "", "RADAR_API_TOKEN", radar), "utf8");
  console.log("✓ RADAR_API_TOKEN .env dosyasına yazıldı");
}

async function calistir() {
  const yalnizcaParola = process.argv.includes("--yalnizca-parola");
  const yalnizcaRadar = process.argv.includes("--yalnizca-radar");
  if (yalnizcaRadar) { radarAnahtariYaz(); return; }
  if (!process.stdin.isTTY) { console.error("Bu betik etkileşimli bir terminalde çalıştırılmalıdır."); process.exit(1); }
  const parola = await gizliSor("Panel parolası (en az 12 karakter): ");
  if (parola.length < 12 || parola.length > 200) { console.error("✗ Parola 12–200 karakter olmalı."); process.exit(1); }
  if (parola !== await gizliSor("Parolayı yeniden yazın: ")) { console.error("✗ Parolalar aynı değil."); process.exit(1); }

  gizliYaz("PANEL_PAROLA_OZETI", await parolaOzeti(parola));
  if (!yalnizcaParola) {
    gizliYaz("OTURUM_ANAHTARI", randomBytes(32).toString("hex"));
    radarAnahtariYaz();
  }
  console.log("Tamam. Parolayı bir parola yöneticisine kaydedin; özetinden geri okunamaz.");
}

// Yalnızca doğrudan çalıştırıldığında (test içe aktarırken değil) başlar.
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`))) await calistir();
