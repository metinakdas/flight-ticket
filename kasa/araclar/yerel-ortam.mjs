// Yerel deneme (wrangler dev) için kasa/.dev.vars dosyasını üretir. Değerler rastgeledir ve yalnızca bu
// bilgisayarda, yerel sunucuda geçerlidir. .dev.vars depoya girmez. Hiçbir değer ekrana yazılmaz.
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parolaOzeti } from "../src/oturum.js";

const hedef = fileURLToPath(new URL("../.dev.vars", import.meta.url));
if (existsSync(hedef) && !process.argv.includes("--yenile")) {
  console.log(".dev.vars zaten var; yeniden üretmek için --yenile ekleyin.");
} else {
  const parola = "yerel-" + randomBytes(9).toString("hex");
  writeFileSync(hedef, [
    "# Yalnızca yerel deneme içindir (wrangler dev). Gerçek ortamın değerleri değildir.",
    `OTURUM_ANAHTARI=${randomBytes(32).toString("hex")}`,
    `PANEL_PAROLA_OZETI=${await parolaOzeti(parola)}`,
    `RADAR_API_TOKEN=${randomBytes(32).toString("hex")}`,
    `YEREL_DENEME_PAROLASI=${parola}`,
    "",
  ].join("\n"), "utf8");
  console.log(".dev.vars üretildi (değerler gösterilmez).");
}
