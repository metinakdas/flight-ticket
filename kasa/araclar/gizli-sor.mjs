// Terminalde yazılanı göstermeden soru sorar. Soru metni görünür; yanıtın karakterleri ekrana yansımaz.
import readline from "node:readline";

export function gizliSor(soru, girdi = process.stdin, cikti = process.stdout) {
  return new Promise((coz) => {
    const rl = readline.createInterface({ input: girdi, output: cikti, terminal: true });
    let sessiz = false;
    // Soru yazıldıktan sonra readline'ın ekrana yazdığı her şey (tuş yankısı, satır yenileme) susturulur.
    rl._writeToOutput = (metin) => { if (!sessiz) cikti.write(metin); };
    rl.question(soru, (yanit) => { rl.close(); cikti.write("\n"); coz(yanit); });
    sessiz = true;
  });
}
