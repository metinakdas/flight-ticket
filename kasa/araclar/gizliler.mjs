// Kasa worker'ının gizli değerlerini kurar. Kendi terminalinizde çalıştırın: node araclar/gizliler.mjs
//
// 1. Panel parolasını iki kez sorar (yazarken görünmez), özetini hesaplar; parolanın kendisi hiçbir yere yazılmaz.
// 2. Oturum anahtarını ve radar anahtarını rastgele üretir.
// 3. Üçünü `wrangler secret put` ile Cloudflare'e standart girdiden gönderir (komut satırına ve ekrana yazılmaz).
// 4. Radar anahtarını projenin .env dosyasına RADAR_API_TOKEN olarak yazar (radar aynı anahtarı kullanır).
//
// Yalnızca parolayı değiştirmek için: node araclar/gizliler.mjs --yalnizca-parola
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { parolaOzeti } from "../src/oturum.js";

const KASA = fileURLToPath(new URL("..", import.meta.url));
const ENV = fileURLToPath(new URL("../../.env", import.meta.url));
const yalnizcaParola = process.argv.includes("--yalnizca-parola");

function gizliSor(soru) {
  return new Promise((coz) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(soru);
    rl._writeToOutput = () => {};  // yazılanlar ekrana yansımaz
    rl.question("", (yanit) => { rl.close(); process.stdout.write("\n"); coz(yanit); });
  });
}

function gizliYaz(ad, deger) {
  const s = spawnSync("npx", ["wrangler", "secret", "put", ad], { cwd: KASA, input: deger, shell: true, stdio: ["pipe", "inherit", "inherit"] });
  if (s.status !== 0) { console.error(`✗ ${ad} yazılamadı. Önce "npx wrangler login" ve "npx wrangler deploy" yapıldığından emin olun.`); process.exit(1); }
  console.log(`✓ ${ad} Cloudflare'e yazıldı`);
}

function envYaz(ad, deger) {
  const satirlar = existsSync(ENV) ? readFileSync(ENV, "utf8").replace(/^﻿/, "").split(/\r?\n/) : [];
  const i = satirlar.findIndex((s) => s.startsWith(ad + "="));
  if (i >= 0) satirlar[i] = `${ad}=${deger}`; else { if (satirlar.length && satirlar[satirlar.length - 1] === "") satirlar.pop(); satirlar.push(`${ad}=${deger}`, ""); }
  writeFileSync(ENV, satirlar.join("\n"), "utf8");
  console.log(`✓ ${ad} .env dosyasına yazıldı`);
}

if (!process.stdin.isTTY) { console.error("Bu betik etkileşimli bir terminalde çalıştırılmalıdır."); process.exit(1); }
const parola = await gizliSor("Panel parolası (en az 12 karakter): ");
if (parola.length < 12 || parola.length > 200) { console.error("✗ Parola 12–200 karakter olmalı."); process.exit(1); }
if (parola !== await gizliSor("Parolayı yeniden yazın: ")) { console.error("✗ Parolalar aynı değil."); process.exit(1); }

gizliYaz("PANEL_PAROLA_OZETI", await parolaOzeti(parola));
if (!yalnizcaParola) {
  gizliYaz("OTURUM_ANAHTARI", randomBytes(32).toString("hex"));
  const radar = randomBytes(32).toString("hex");
  gizliYaz("RADAR_API_TOKEN", radar);
  envYaz("RADAR_API_TOKEN", radar);
}
console.log("\nTamam. Parolayı bir parola yöneticisine kaydedin; özetinden geri okunamaz.");
