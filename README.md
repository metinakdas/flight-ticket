# Flight Ticket Radar

Belirli havalimanlarından kalkan ucuz uçak biletlerini kendiliğinden bulup haber veren kişisel bir
takip sistemi. Ne arandığı bir kez tanımlanır; sistem 30 dakikada bir kontrol eder ve yalnızca
değerli bir şey bulduğunda Telegram, WhatsApp ve e-postayla bildirir. Bilet satmaz; yalnızca bulur
ve bağlantı verir.

Mimari ve iş kuralları: [MIMARI.md](MIMARI.md)

## Durum

Proje yapım aşamasında. Şu an depoda güvenlik araçları, kasa (Cloudflare Worker + D1) ve panelin takip
ekranları var; radar motoru ve bildirimler sonraki fazlarda eklenir (MIMARI.md, 13. bölüm).
Kasa kurulumu: [kasa/KURULUM.md](kasa/KURULUM.md)

## Yapı

- Tamamı ücretsiz katmanlarda çalışır; sunucu yoktur.
- Motor GitHub Actions'ta, veri Cloudflare D1'de, izleme Grafana Cloud'dadır.
- Depo herkese açıktır: anahtarlar, alıcı bilgileri ve takip kuralları depoya girmez.

## Geliştirme

```
python -m venv .venv
.venv\Scripts\pip install --require-hashes -r requirements-dev.txt
.venv\Scripts\python -X utf8 -m pytest -q
```

Kasa ve panel kuralı testleri: `node --test "kasa/test/*.test.mjs"` (Node 24; paket kurulmaz).

Testler internete çıkmaz ve gizli bilgi istemez.

## Komutlar

| Komut | İşi |
|---|---|
| `python -m radar yayinla --deneme` | Güvenlik taramasını çalıştırır, ne göndereceğini yazar, hiçbir şey göndermez |
| `python -m radar yayinla` | Taramadan geçirip GitHub'a gönderir, Secrets'ı yazar, depoyu sıkılaştırır |
| `python -m radar yayinla --yalnizca-ayarlar` | Dosya göndermeden Secrets ve depo ayarlarını uygular |
| `python -m radar commit-denetimi` | Son commit'lerde atıf satırı ve kişisel e-posta arar |

Windows'ta Türkçe çıktı için Python `-X utf8` ile çalıştırılır.

## Güvenlik

- `.env` depoya girmez; yalnızca `.env.example` girer.
- Her gönderimden önce depoya girecek tüm dosyalar anahtar, kişisel bilgi ve yerel yasaklı ad listesi
  için taranır; tek bulgu varsa hiçbir şey gönderilmez.
- Bağımlılıklar hash ile, GitHub Actions eylemleri commit SHA ile sabitlenir.
- Commit'ler GitHub'ın `noreply` adresiyle atılır.
