// Test ortamı: D1 yerine Node'un yerleşik SQLite'ı, ASSETS yerine panel klasörü. İnternete çıkılmaz.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { randomBytes } from "node:crypto";
import worker from "../src/worker.js";
import { parolaOzeti } from "../src/oturum.js";

const KOK = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TURLER = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".json": "application/json" };

class Ifade {
  constructor(db, sql, degerler = []) { this.db = db; this.sql = sql; this.degerler = degerler; }
  bind(...degerler) { return new Ifade(this.db, this.sql, degerler); }
  async first() { return this.db.prepare(this.sql).get(...this.degerler) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.degerler) }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.degerler); return { meta: { changes: Number(r.changes) } }; }
}

function sahteD1() {
  const db = new DatabaseSync(":memory:");
  for (const dosya of readdirSync(join(KOK, "kasa", "gocler")).sort()) db.exec(readFileSync(join(KOK, "kasa", "gocler", dosya), "utf8"));
  return {
    ham: db,
    prepare: (sql) => new Ifade(db, sql),
    async batch(ifadeler) {
      db.exec("BEGIN");
      try { const s = []; for (const i of ifadeler) s.push(await i.run()); db.exec("COMMIT"); return s; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

const sahteDosyalar = {
  async fetch(request) {
    let yol = new URL(request.url).pathname;
    if (yol === "/") yol = "/index.html";
    let dosya = join(KOK, "panel", yol);
    if (!extname(dosya) && existsSync(dosya + ".html")) dosya += ".html";
    if (!dosya.startsWith(join(KOK, "panel")) || !existsSync(dosya) || !extname(dosya)) return new Response("yok", { status: 404 });
    return new Response(readFileSync(dosya), { headers: { "content-type": TURLER[extname(dosya)] || "application/octet-stream" } });
  },
};

export const PAROLA = "deneme-" + randomBytes(9).toString("hex");
export const KOKEN = "https://kasa.test";

export async function ortamKur(ek = {}) {
  const env = {
    DB: sahteD1(), ASSETS: sahteDosyalar,
    OTURUM_ANAHTARI: randomBytes(32).toString("hex"),
    PANEL_PAROLA_OZETI: await parolaOzeti(PAROLA, undefined, 10000),
    RADAR_API_TOKEN: randomBytes(32).toString("hex"),
    ...ek,
  };
  const istek = (yol, { yontem = "GET", govde, basliklar = {}, cerez, ip = "203.0.113.7" } = {}) => {
    const h = { "cf-connecting-ip": ip, ...basliklar };
    if (cerez) h.cookie = cerez;
    let body;
    if (govde !== undefined) { body = typeof govde === "string" ? govde : JSON.stringify(govde); h["content-type"] ??= "application/json"; h.origin ??= KOKEN; }
    return worker.fetch(new Request(KOKEN + yol, { method: yontem, headers: h, body, redirect: "manual" }), env);
  };
  const girisYap = async (ip) => {
    const y = await istek("/api/giris", { yontem: "POST", govde: { parola: PAROLA }, ip });
    return (y.headers.get("set-cookie") || "").split(";")[0];
  };
  return { env, istek, girisYap };
}

export const ornekTakip = (ek = {}) => ({
  ad: "", tur: "rota", kalkis: ["SAW"], varis: { kapsam: "havalimani", havalimanlari: ["ERZ"] }, yon: "tek",
  tarih: { bicim: "surekli", pencere: 90, gunler: [] }, yolcu: 1, aktarma: "farketmez", havayolu: { kip: "hepsi" },
  tetikler: { esik: { acik: true, tutar: 1500 } }, kanallar: ["telegram", "eposta"], gunlukSinir: 10, ...ek,
});
