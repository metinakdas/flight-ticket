# Flight Ticket · mimari ve iş kuralları

Sürüm 3 · 17 Kasım 2026

Bu belge projenin mimarisini, bileşenlerini, veri modelini, iş kurallarını, güvenlik düzenini ve
tasarım dilini anlatır. Projeyi hiç bilmeyen biri bu dosyayı okuyarak yapıyı anlayabilmelidir.

---

## 1. Amaç

Belirli havalimanlarından kalkan **ucuz uçak biletlerini** kendiliğinden bulup haber veren kişisel
bir takip sistemi. Kullanıcı ne aradığını bir kez tanımlar; sistem 30 dakikada bir kontrol eder ve
yalnızca gerçekten değerli bir şey bulduğunda WhatsApp, Telegram ve e-postayla bildirir.

Karşılanması gereken örnek istekler:

| # | İstek | Karşılayan takip türü |
|---|---|---|
| 1 | "İstanbul Havalimanı ya da Sabiha Gökçen'den kalkan, 1.500 TL ve altındaki biletleri bildir" | Bütçe takibi |
| 2 | "Sabiha Gökçen – Erzurum biletlerini izle; son 30 günün en ucuzu çıkınca haber ver" | Rota takibi |
| 3 | "Gidiş 10–15 Mayıs arası, dönüş 18–22 Mayıs arası; en ucuz birleşimi bul" | Gidiş-dönüş takibi |
| 4 | "Nisan–Haziran arasını sürekli izle, ucuz günleri bildir" | Dönem takibi |
| 5 | "Havayolları kampanya açınca anında haber ver" | Kampanya radarı |

**Kapsam dışı:** bilet satın alma, rezervasyon, ödeme, yolcu bilgisi saklama. Sistem yalnızca
bulur ve bağlantı verir; satın alma havayolunun ya da satıcının sitesinde yapılır.

---

## 2. Değişmez kurallar

Bu kurallar her kararın önündedir. Biriyle çelişen bir çözüm gerekiyorsa çözüm
uygulanmaz; karar depo sahibine bırakılır.

### Ücretsizlik

- **Ü-1** Hiçbir bileşen ücretli olamaz. Her servis ücretsiz katmanında kullanılır.
- **Ü-2** Kredi kartı isteyen bir servis, ücretsiz olsa bile depo sahibinin açık onayı olmadan
  kullanılmaz.
- **Ü-3** Ücretsiz sınır dolarsa sistem **yavaşlar** (daha az sorgu, daha seyrek tarama) ve
  bunu bildirir. Kendiliğinden ücretli plana geçilmez.
- **Ü-4** Sunucu kurulmaz. Sürekli açık bir makine, Docker ana makinesi ya da kiralık sunucu yok.

### Kimlik ve depo görünümü

- **D-1** GitHub'da katkıda bulunanlar (contributors) bölümünde **yalnızca depo sahibinin hesabı**
  görünür.
- **D-2** Commit'ler kişisel e-postayla değil, GitHub'ın `noreply` adresiyle atılır.
- **D-3** Push `git pull --rebase` ile yapılır; zorla gönderme (force push) yok.

### Gizlilik (depo herkese açık olacak)

- **G-1** Depoda yalnızca kod, şablonlar ve kamuya açık sabit veriler (havalimanı listesi gibi)
  durur.
- **G-2** Şunlar depoya **hiçbir zaman** girmez: anahtarlar ve şifreler, telefon numaraları,
  sohbet kimlikleri, e-posta adresleri, kişisel klasör yolları, **takip kuralları** ve bunlara
  bağlı fiyat geçmişi. Takip kuralları seyahat planını ele verir; özel bilgidir.
- **G-3** Herkese açık depoda GitHub Actions günlükleri de herkese açıktır. Günlüklere rota, tarih,
  bütçe, alıcı ya da kullanıcı bilgisi yazılmaz; yalnızca sayılar ve takibin kısa kimliği yazılır.
- **G-4** Anahtarlar hiçbir mesaja, belgeye ya da komut satırına yapıştırılmaz; yalnızca `.env`
  dosyasına ya da gizli giriş isteyen komuta yazılır. Başka bir yere yapıştırılan anahtar sızmış
  sayılır ve yenilenir.
- **G-5** `.env` içeriği ekrana ya da günlüğe yazdırılmaz.
- **G-6** Kurulum için açılan geçici yönetici anahtarları iş bitince silinir. Kalıcı anahtarlar
  en dar yetkiyle açılır.

---

## 3. Referans proje: Tarife Radarı (otoyol ücretleri)

Bu projenin altyapısı, çalışan bir önceki projeden alınır. Aynı desenler burada da kullanılır.

- GitHub: `metinakdas/otoyol-ucretleri` (herkese açık)

### Oradan alınacak parçalar

| Parça | Referans dosya | Burada ne olur |
|---|---|---|
| Telegram, WhatsApp, e-posta gönderimi; kanal bazında gönderim takibi | `radar/notify.py` | Aynen taşınır, mesaj metinleri değişir |
| E-posta şablon motoru ve tasarımlar | `radar/eposta.py`, `radar/eposta_sablon/` | Motor aynen; şablonlar bilet içeriğine uyarlanır |
| Gizli bilgi maskeleme | `radar/guvenlik.py` | Aynen |
| Grafana'ya log gönderimi | `radar/izleme.py` | Aynen, etiket `app="flight-ticket"` |
| Yayın öncesi güvenlik taraması, depo sıkılaştırma, Secrets yükleme | `radar/yayin.py` | Aynen, depo adı değişir |
| Dış zamanlayıcı | `tetikleyici/` | Aynen, farklı dakika |
| Grafana kural, şablon ve tatbikat betiği | `grafana/` | Kurallar bu projeye göre yeniden yazılır |
| İş akışları | `.github/workflows/radar.yml`, `testler.yml` | Uyarlanır; veri commit'i ve Pages işi kalkar |
| Panel tasarım dili | `panel/style.css`, `panel/theme.js` | Renk ve yazı tipi belirteçleri aynen |
| İzleme mimarisi anlatımı | `IZLEME_MIMARISI.md` | Bu projenin izleme bölümü buna göre yazılır |

### Orada öğrenilen dersler (tekrar yaşanmasın)

1. **GitHub'ın kendi cron'u güvenilmez.** `*/30` yazıldığı hâlde günde 48 yerine 3–4 tur çalıştı.
   Çözüm: Cloudflare Workers'tan `workflow_dispatch`. GitHub cron'u yalnızca yedek.
2. **Bildirim kanalı tanımsızken hiçbir şey "gönderildi" sayılmamalı.** Önceki projede kanal yokken tur
   çalışmıyordu. Burada tur çalışır, ama gönderim denenmez ve kayıt düşülmez (B-14).
3. **Gönderim takibi kanal bazında tutulur.** E-posta bozulduğunda Telegram'a gitmiş mesaj
   yeniden gönderilmez; yalnızca e-posta yeniden denenir.
4. **E-posta arızası Telegram'dan bildirilir**: ilk hatada bir kez, sonra 24 saatte bir; 3 gün
   sonra o mesaj için vazgeçilir.
5. **Gmail**: iki adımlı doğrulama şart; giriş şifresi değil 16 haneli uygulama şifresi kullanılır.
6. **WhatsApp şablonu**: gövde değişkenle başlayamaz ve bitemez; mesaj tek satır, en fazla 900
   karakter gider.
7. **Grafana e-posta alarmı** yalnızca kuruluş üyesi adreslere gider; alıcı Viewer olarak eklenir.
8. **Grafana e-posta gövdesi HTML'i kaçışlar**; alarm e-postası düz metin olmalıdır.
9. **Grafana'da Editor yetkili anahtar servis hesabı silemez**; silmeyi kullanıcı arayüzden yapar.
10. **Grafana alarm sorguları JSON biçimine bağlıdır** (`"olay": "tur"`, iki noktadan sonra boşluk).
    Log biçimi değişirse kurallar da değişmelidir.
11. **"Tur yok" alarmı yalnızca GitHub turlarını sayar.** Yerel çalıştırmalar kesintiyi gizlemesin.
12. **Cloudflare'de ilk yükleme** `workers.dev` alt alan adı ister; kullanıcı Workers sayfasını bir
    kez açınca oluşur.
13. **GitHub'ın sunucuları yurt dışındadır.** Türk siteleri yurt dışı IP'lerini engelleyebilir;
    kampanya sayfaları için bu risk Faz 0'da sınanır.
14. **Windows'ta Türkçe çıktı** için Python `-X utf8` ile çalıştırılır.
15. **Bağımlılıklar hash ile, Actions adımları commit SHA ile sabitlenir.**

---

## 4. Genel mimari

Dört parça var. Hepsi ücretsiz katmanda, hiçbiri bizim bakacağımız bir sunucu değil.

```
┌───────────────────────────── Cloudflare (ücretsiz) ─────────────────────────────┐
│                                                                                 │
│  zamanlayıcı worker            kasa worker  (tek herkese açık adres, girişli)   │
│  · her saat :20 ve :50 (UTC)   · panel (arayüz dosyaları)                       │
│  · herkese açık adresi yok     · /api/*      panelin kullandığı uçlar (oturum)  │
│  · tek işi: GitHub turunu      · /api/ic/*   radarın kullandığı uçlar (anahtar) │
│    başlatmak                   · D1 veritabanı: takipler, fiyat gözlemleri,     │
│                                  fırsatlar, gönderim kayıtları, kampanyalar     │
└──────────┬──────────────────────────────▲───────────────┬───────────────────────┘
           │ workflow_dispatch            │ takipleri oku │ sonuçları yaz
           ▼                              │               │
┌───────────────────────────── GitHub Actions (herkese açık depo) ────────────────┐
│  python -m radar calistir                                                       │
│   1. kasadan etkin takipleri al                                                 │
│   2. sorgu planını çıkar (bütçeye göre önceliklendir)                           │
│   3. fiyat kaynağını sorgula · kampanya sayfalarını kontrol et                  │
│   4. gözlemleri süz (havalimanı, tarih, aktarma) ve kaydet                      │
│   5. takip kurallarını değerlendir → fırsatlar                                  │
│   6. bildirimleri gönder: Telegram · WhatsApp · e-posta                         │
│   7. sonuçları kasaya yaz · tur kayıtlarını Grafana'ya gönder                   │
│  Depoya veri yazılmaz. Günlüklerde özel bilgi yoktur.                           │
└──────────────────────────────┬──────────────────────────────────────────────────┘
                               │ yalnızca HTTPS, maskelenmiş kayıtlar
                               ▼
┌───────────────────────────── Grafana Cloud (ücretsiz) ──────────────────────────┐
│  Loki (loglar) · "Flight Ticket İzleme" panosu · alarm kuralları                │
│  alarm → Telegram teknik grubu + e-posta                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Neden böyle

- **Motor GitHub Actions'ta**, çünkü herkese açık depoda süre sınırı yok, Python ve testler rahat
  çalışıyor, önceki projeyle aynı.
- **Veri Cloudflare D1'de**, çünkü depo herkese açık ve takip kuralları özel (G-2). Önceki projede
  veri depoya commit ediliyordu; burada edilmez.
- **İki ayrı worker**, çünkü internete açık olan kasa worker'ında GitHub anahtarı durmamalı.
  Zamanlayıcının adresi yoktur; kasanın GitHub yetkisi yoktur.
- **Panel kasa worker'ından sunulur** (aynı adres). Böylece ayrı bir site, alan adı ya da
  kökenler arası izin ayarı gerekmez.
- **İzleme dışarıda**, çünkü GitHub durursa alarmı başka birinin vermesi gerekir.

---

## 5. Bileşenler

### 5.1 Zamanlayıcı (Cloudflare Worker)

- Referans: önceki projedeki `tetikleyici/worker.js` ve `wrangler.toml`.
- Zamanlama: `20,50 * * * *` (UTC). Önceki proje `5,35` kullanıyor; çakışmasın.
- `workers_dev = false`, rota yok; dışarıdan çağrılamaz.
- Tek gizli bilgi `GH_TOKEN`: yalnızca bu depo, yalnızca **Actions: Read and write** yetkili,
  süresi 1 yıl olan fine-grained anahtar. `wrangler secret put GH_TOKEN` ile girilir.
- İş akışına `tetik=zamanlayici` girdisi gönderir; tur bunu kaydına yazar.
- GitHub'daki `*/30` cron'u yedek olarak kalır; iki tetikleme çakışırsa `concurrency` sıraya koyar.
- Turlar `RADAR_ETKIN` depo değişkeni `true` iken çalışır; değişken kapatılınca iş akışı tetiklense de tur
  çalışmaz. Turları durdurmanın yolu budur.

### 5.2 Kasa (Cloudflare Worker + D1)

Takiplerin ve tüm çalışma verisinin durduğu yer.

**Kişisel bilgi tutmaz.** Telefon numaraları, sohbet kimlikleri ve e-posta adresleri D1'de
durmaz; bunlar önceki projedeki gibi GitHub Secrets'ta kalır. Takipler kanalı yalnızca adıyla
seçer (`telegram`, `whatsapp`, `eposta`).

Uçlar:

| Uç | Kim kullanır | Kimlik doğrulama |
|---|---|---|
| `/` ve arayüz dosyaları | Kullanıcı | Oturum (aşağıda) |
| `/api/takipler`, `/api/firsatlar`, `/api/analiz`, `/api/kampanyalar`, `/api/ayarlar`, `/api/durum`, `/api/sabitler` | Panel | Oturum çerezi |
| `/api/ic/takipler` (oku), `/api/ic/sonuc` (yaz) | Radar (GitHub Actions) | `RADAR_API_TOKEN` (Bearer) |

Giriş koruması **worker içinde tek kullanıcılı giriştir**. Cloudflare Access kullanılmaz: ücretsiz planı
seçilirken de ödeme yöntemi istendiği bildirildi (Ü-2).

- Parolanın kendisi saklanmaz; özeti (PBKDF2-SHA256, 100.000 tur) worker secret'ı olarak durur.
- Başarılı girişte imzalı, `HttpOnly; Secure; SameSite=Strict` çerez verilir; 7 gün geçerlidir.
- IP başına 15 dakikada 5 hatalı denemeden sonra giriş kilitlenir. IP'nin kendisi değil, anahtarlı
  özeti saklanır.
- Gizli değerler tanımlı değilse giriş tümüyle kapalıdır.
- Girişsiz yalnızca giriş sayfası ve tasarım dosyaları açılır; diğer her yol girişe yönlenir.

Kasa güvenlik kuralları:

- Tüm SQL parametreli sorgudur; girdi sunucuda yeniden doğrulanır (arayüz doğrulamasına güvenilmez).
- Havalimanı ve havayolu kodları sabit listeden doğrulanır; liste dışı kod reddedilir.
- Yanıtlarda `X-Robots-Tag: noindex`, sıkı CSP, `Referrer-Policy: no-referrer`.
- Üçüncü taraf betik, izleme kodu ya da dış yazı tipi yüklenmez; her şey kendi dosyalarımızdan.
- `/api/ic/*` yalnızca radar anahtarıyla, yalnızca gereken iki işlemi yapar.
- Yükleme `wrangler deploy` ile depo sahibinin bilgisayarından elle yapılır; GitHub'a Cloudflare
  yönetim anahtarı konmaz.

### 5.3 Radar motoru (Python, GitHub Actions)

Paket adı `radar`. Bir tur şu sırayla ilerler:

1. **Ön denetim.** Kasa bağlantısı ya da fiyat kaynağı anahtarı tanımlı değilse tur çalışmaz, Actions'ta
   uyarı verir. Bildirim kanalı tanımlı değilse tur yine çalışır: fırsatlar kasaya yazılır ve panelde
   görünür, gönderim denenmez (B-14).
2. **Takipleri al.** Kasadan etkin takipler okunur. Kasaya ulaşılamazsa tur "hata" olarak
   kaydedilir ve biter; eski kopyayla çalışılmaz.
3. **Süresi dolanları kapat.** Tarih penceresi tamamen geçmişte kalan takip "süresi doldu" yapılır.
4. **Sorgu planı.** Her takip sorgulara açılır, aynı sorgular birleştirilir, bütçeye göre
   sıralanır (7. bölüm, P kuralları).
5. **Fiyatları topla.** Kaynak arayüzünden gözlemler alınır (6. bölüm).
6. **Süz ve kaydet.** Kurallara uymayan gözlem atılır; kalanlar kasaya yazılmak üzere biriktirilir.
7. **Değerlendir.** Her takip için tetikler çalışır, fırsatlar çıkar.
8. **Bildir.** Gönderim kanal bazında izlenir; başarısız olan bir sonraki turda yeniden denenir.
9. **Sonuçları yaz.** Gözlemler, fırsatlar, gönderim kayıtları ve tur özeti tek istekte kasaya gider.
10. **İzleme.** Turun kayıtları maskelenerek Grafana'ya gönderilir. Bu adımın hatası turu bozmaz.

Komutlar (önceki projeyle aynı adlandırma):

| Komut | İşi |
|---|---|
| `python -m radar calistir` | Tam tur |
| `python -m radar calistir --deneme` | Bildirim göndermeden, kasaya yazmadan tur; ne yapacağını yazar |
| `python -m radar kaynak-testi` | Fiyat kaynağı ve kampanya sayfalarına erişimi dener |
| `python -m radar test-bildirim` | Üç kanala deneme mesajı |
| `python -m radar yayinla [--deneme] [--yalnizca-ayarlar]` | Güvenlik taraması, depo ayarları, Secrets, gönderim |

### 5.4 Panel (arayüz)

Tarayıcıda çalışan, sunucu tarafı işlemi olmayan sade bir arayüz. Ekranlar ve form 8. bölümde.

### 5.5 Bildirim kanalları

Üçü de önceki projedeki kurulumla aynı çalışır; kod `radar/notify.py`'den taşınır.

| Kanal | Servis | Ücretsiz sınır | Kurulum notu |
|---|---|---|---|
| Telegram | Bot API | Sınırsız | BotFather'dan **yeni bot**; ana grup + teknik grup. `/setjoingroups` Disable, `/setprivacy` Enable. Bot gelen mesajı okumaz. |
| WhatsApp | Meta WhatsApp Cloud API **test numarası** | En fazla 5 doğrulanmış alıcı | Kalıcı "system user" anahtarı; onaylı şablon (ör. `bilet_bildirim`, dil Türkçe, tek değişken `{{1}}`, değişkenin önünde ve arkasında sabit metin). |
| E-posta | Gmail SMTP (`smtp.gmail.com:587`, STARTTLS) | Günlük gönderim sınırı (kişisel kullanımda dolmaz) | İki adımlı doğrulama + uygulama şifresi. Sertifika her zaman doğrulanır; şifreli bağlantı kurulamazsa gönderilmez. |

WhatsApp şablonu fiyat fırsatı içerdiği için Meta bunu "Utility" yerine "Marketing" sayabilir;
onay sürecinde görülür. Test numarasında ücret yoktur.

### 5.6 İzleme (Grafana Cloud)

- Önceki projenin Grafana yığını yeniden kullanılır (ücretsiz planda tek yığın). Bu proje ayrı
  etiketle ayrılır: `app="flight-ticket"`, `ortam="github"|"yerel"`, `level="info"|"error"`.
- **Ayrı** bir log yazma anahtarı açılır (yalnızca `logs:write`), ki biri iptal edilince diğer
  proje etkilenmesin.
- Ayrı klasör, pano, kural grubu, alarm kanalı ve yönlendirme.
- Yığın adresi ve kullanıcı numarası depoya yazılmaz; `.env` ve GitHub Secrets'ta durur.
- `--deneme` turları Grafana'ya yazılmaz.

Loki'ye giden olaylar (her satır tek JSON):

| olay | alanlar |
|---|---|
| `tur` | durum (tamam/kismi/hata/coktu), tetik, sure_sn, cpu_sn, bellek_mb, takip, sorgu, sorgu_hata, gozlem, firsat, bildirim_hata, butce_kalan |
| `kaynak` | kaynak (kimlik), durum, http kodu, bilgi |
| `bildirim` | kanal, durum, mesaj türü |
| `kampanya` | havayolu, durum (yeni/değişmedi/hata) |
| `not` | mesaj |

Bu kayıtlarda rota, tarih, bütçe ve alıcı bilgisi **bulunmaz**; takip yalnızca kısa kimliğiyle
geçer. Her alan gönderilmeden önce `redact()` süzgecinden geçer.

Alarm kuralları (10 dakikada bir değerlendirilir):

| Kural | Koşul | Önem |
|---|---|---|
| Radar turu yok | Son 90 dakikada GitHub turu yok (veri yoksa da alarm) | Kritik |
| Tur çöktü | Son 30 dakikada `durum=coktu` | Kritik |
| Bildirim gönderilemedi | Son 1 saatte bildirim hatası | Kritik |
| Kasaya ulaşılamıyor | Son 1 saatte 2'den fazla kasa hatası | Kritik |
| Fiyat kaynağı okunamıyor | Son 3 saatte 3'ten fazla kaynak hatası | Uyarı |
| Hiç fiyat gelmedi | Etkin takip varken son 24 saatte sıfır gözlem | Uyarı |
| Sorgu bütçesi tükeniyor | Son 6 saatte kaynak 429 döndürdü | Uyarı |
| Tur anormal yavaş | Tur süresi 5 dakikayı aştı | Uyarı |
| Hata yoğunluğu | 24 saatte 10'dan fazla hata kaydı | Uyarı |

Alarm bildirimleri Türkçedir ve "ne yapmalıyım" adımlarını içerir. Kurulum sonunda tatbikat
yapılır: sahte bir hata kaydı gönderilip alarmın iki kanala da ulaştığı görülür.

---

## 6. Fiyat verisi

Projenin en büyük bilinmeyeni budur. Kasım 2026 araştırmasının sonucu:

| Kaynak | Durum |
|---|---|
| Amadeus ücretsiz geliştirici erişimi | 17 Temmuz 2026'da kapandı |
| Skyscanner | Yalnızca onaylı iş ortakları |
| Kiwi | Davetle |
| Google Flights | Resmî erişim yok; kazıyan servisler ücretli |
| **Travelpayouts (Aviasales verisi)** | **Ücretsiz; kayıtla açılıyor. Fiyatlar canlı değil: başka kullanıcıların son 2–7 gündeki aramalarından** |
| Havayolu sitelerini doğrudan okumak | Bot koruması ve kullanım şartları; yapılmaz (V-5) |
| Google Flights fiyat uyarısı e-postaları | Aday ek kaynak; hesap sahibinin kendi posta kutusundan IMAP ile okunur. Örnek e-postalarla sınanacak |

Canlı fiyat kurallara uygun biçimde ücretsiz alınamıyor (karar 8). Fiyatlar önbellekten
(Travelpayouts) ve, sınama olumlu çıkarsa, fiyat uyarısı e-postalarından gelir; her bildirimde
fiyatın yaşı yazar. Kesin fiyat havayolu sitesinde doğrulanır.

**Birincil kaynak: Travelpayouts GraphQL arayüzü** (`/graphql/v1/query`, `prices_one_way` ve
`prices_round_trip`). Faz 0 ölçümüne göre:

- `origin_type: AIRPORT` ve `destination_type: AIRPORT` ile IST ve SAW ayrı sorgulanır; yanıtta
  gerçek kalkış ve varış havalimanı, havayolu, uçuş numarası, aktarma sayısı, bagaj bilgisi ve
  fiyatın görüldüğü an (`found_at`) birlikte gelir.
- Tek istek, bir rotanın 90 günlük penceresinde gün başına en ucuz kaydı verir (P-3).
- Fiyat TL gelir (`currency: "try"`).

**Yedek yol: REST uçlarını eşleştirmek.** GraphQL kullanılamazsa `/v2/prices/month-matrix`
(en geniş gün kapsamı ve `found_at`, ama yalnızca şehir kodu) ile `/aviasales/v3/prices_for_dates`
(gerçek havalimanı ve havayolu, ama `found_at` yok) tarih, saat ve fiyat üzerinden eşleştirilir.
Bu yol şehir başına gün başına tek kayıt verdiği için yalnızca SAW kalkışlı takiplerde işe
yarar; IST kayıtları neredeyse hiç gelmez. Eşleşmeyen `month-matrix` kayıtları "havalimanı
belirsiz" sayılır (H-4).

Bilinen sınırlar: veri başka kullanıcıların aramalarından gelir, 0–7 gün eskidir; az aranan
rotalarda (ör. Erzurum) 91 günün yaklaşık 20'sinde fiyat vardır. Kullanım şartları ve ortaklık
bağlantısı zorunluluğu okunamadı: **doğrulanmadı**.

### Kaynak kuralları

- **V-1** Fiyat kaynakları tek bir arayüzün arkasındadır (`FiyatKaynagi`: "şu kalkış, şu varış,
  şu tarih aralığı için gözlemleri ver"). Kaynak değiştirmek ya da ikincisini eklemek motorun
  geri kalanına dokunmaz.
- **V-2** Her gözlem şunları taşır: kalkış ve varış **havalimanı** kodu, gidiş tarihi, varsa dönüş
  tarihi, kişi başı toplam fiyat (TL), havayolu, aktarma sayısı, kaynağın fiyatı gördüğü an,
  bizim okuduğumuz an, satın alma bağlantısı.
- **V-3** Fiyat TL'ye kaynağın verdiği kurla çevrilmiş gelir; biz kur çevirmeyiz. TL gelmiyorsa
  kaynak yetersiz sayılır.
- **V-4** Kaynağın kullanım şartları okunur ve uyulur. İstek sınırına uyulur; 429 gelirse o turda
  durulur ve sonraki turda bütçe yarıya iner.
- **V-5** Korumayı aşmaya yönelik hiçbir şey yapılmaz: CAPTCHA çözme, vekil sunucu döndürme,
  gizlenme eklentisi, parmak izi ya da kimlik taklidi yok. Bir site engellerse o kaynak bırakılır
  ve bu kullanıcıya bildirilir. Her kaynağa saniyede en fazla 1 istek gider.
- **V-6** Kaynak adresleri ve anahtarları sabit yapılandırmadan gelir; kullanıcı girdisinden adres
  kurulmaz.
- **V-7** Her bildirim fiyatın yaşını ("X saat önce görüldü") ve havayolunun kendi sitesine
  bağlantıyı taşır. Sistem fiyatı canlı doğrulamaz; kesin fiyat havayolu sitesinde doğrulanır.
- **V-8** Havayolu–havalimanı tutarlılığı denetlenir: kaynağın verdiği havalimanı, o havayolunun
  uçtuğu bilinen havalimanlarıyla çelişiyorsa gözlem "havalimanı belirsiz" işaretlenir (H-4).

### Kampanya sayfaları

- Havayollarının herkese açık kampanya sayfaları izlenir (başlangıç: THY, Pegasus, AJet,
  SunExpress). Önceki projedeki "resmî sayfa değişti mi" mantığıyla aynıdır.
- Her kaynak turda en fazla bir kez, önbellek başlıklarıyla (ETag / If-Modified-Since) istenir.
- `robots.txt` izin vermiyorsa ya da site engelliyorsa o havayolu listeden çıkarılır.
- Yurt dışı IP engeli Faz 0'da sınanır (3. bölüm, ders 13).

---

## 7. İş kuralları

### 7.1 Kavramlar

| Kavram | Anlamı |
|---|---|
| **Takip** | Kullanıcının tanımladığı bir arama isteği |
| **Gözlem** | Bir kaynaktan okunan tek fiyat kaydı |
| **Günlük taban** | Bir rota için o gün görülen en düşük fiyat |
| **Tetik** | Bir gözlemi bildirime değer kılan koşul |
| **Fırsat** | Bir takibin tetiğini sağlayan gözlem |
| **Tur** | Sistemin 30 dakikada bir yaptığı tek çalışma |

### 7.2 Takip türleri

| Tür | Kalkış | Varış | Tarih | Tipik tetik |
|---|---|---|---|---|
| **Bütçe** | 1–4 havalimanı | Belirli havalimanları, "yurt içi", "yurt dışı", ülke listesi ya da "her yer" | Aralık, aylar ya da sürekli | Eşik |
| **Rota** | 1–4 havalimanı | 1–4 havalimanı | Aralık, aylar ya da sürekli | Dönemin en düşüğü, düşüş yüzdesi |
| **Gidiş-dönüş** | 1–4 havalimanı | 1–4 havalimanı | Gidiş aralığı + dönüş aralığı ya da kalış süresi | Eşik (toplam fiyat) |
| **Dönem** | 1–4 havalimanı | Belirli ya da geniş | Bir ya da birkaç ay | Eşik, dönemin en düşüğü |
| **Kampanya** | İsteğe bağlı süzgeç | İsteğe bağlı süzgeç | Yok | Yeni kampanya |

Türler aynı veri yapısını kullanır; tür, formdaki varsayılanları ve mesaj metnini belirler.

### 7.3 Havalimanı kuralları

Kullanıcının en net isteği: **alakasız havalimanı çıkmasın.**

- **H-1** Kalkış her zaman **havalimanı kodu** olarak saklanır, şehir kodu olarak değil. İstanbul
  için IST ve SAW ayrı ayrı seçilir.
- **H-2** Arayüzdeki "İstanbul (tümü)" gibi kısayollar kaydedilirken açık listeye çevrilir
  (`[IST, SAW]`). Sonradan bir havalimanı eklenirse eski takipler kendiliğinden genişlemez.
- **H-3** `IST` hem havalimanı hem şehir kodudur. Kaynak her zaman havalimanı türüyle sorgulanır
  (`origin_type: AIRPORT`). Yine de dönen her gözlemin **gerçek kalkış havalimanı** alanına
  bakılır; listede yoksa gözlem atılır.
- **H-4** Gözlemde gerçek kalkış ya da varış havalimanı yoksa gözlem "havalimanı belirsiz"
  işaretlenir; saklanır ama **bildirim tetiklemez**.
- **H-5** Varış da aynı sıkılıkla süzülür. "Yurt içi", "ülke" ya da "her yer" seçildiyse varış
  ülkesi havalimanı listesinden bulunur.
- **H-6** Gidiş-dönüşte dönüş, gidişin varış havalimanından kalkar ve seçili kalkış
  havalimanlarından birine iner. "Farklı havalimanına dönüş" takipte açıkça işaretlenirse serbesttir.
- **H-7** Aktarmalı uçuşta ara havalimanı süzgece girmez; yalnızca ilk kalkış ve son varış sayılır.
- **H-8** Havalimanı listesi (kod, ad, şehir, ülke) depoda duran sabit bir dosyadır ve tek doğruluk
  kaynağıdır.

### 7.4 Tarih kuralları

- **T-1** Uçuş tarihleri kalkış havalimanının yerel tarihidir. Zaman damgaları UTC saklanır,
  ekranda ve mesajlarda Türkiye saatiyle gösterilir.
- **T-2** Geçmiş tarih sorgulanmaz. Aralığın bir kısmı geçmişte kaldıysa kalan kısım izlenir.
- **T-3** Tarih seçim biçimleri:
  - **Belirli aralık:** başlangıç ve bitiş günü.
  - **Aylar:** bir ya da birkaç ay (ör. Nisan, Mayıs, Haziran).
  - **Sürekli:** bugünden başlayan kayan pencere (varsayılan 90 gün, en fazla 330 gün).
- **T-4** Haftanın günleri süzgeci (ör. yalnızca cuma kalkış). Boşsa her gün.
- **T-5** Gidiş-dönüşte iki biçimden biri seçilir: dönüş tarih aralığı ya da kalış süresi
  (en az–en çok gece). Dönüş gidişten önce olamaz.
- **T-6** Tüm penceresi geçmişte kalan takip "süresi doldu" olur ve bir kez bilgi mesajı gider.
- **T-7** Kalkış saat aralığı süzgeci yalnızca kaynak uçuş saatini veriyorsa uygulanır; vermiyorsa
  mesajda "saat bilgisi yok" yazar ve gözlem atılmaz.

### 7.5 Fiyat kuralları

- **F-1** Tüm fiyatlar TL, **kişi başı**, vergiler dahil toplamdır.
- **F-2** Eşik tek yön takipte tek yön fiyatına, gidiş-dönüş takipte kişi başı toplam fiyata uygulanır.
- **F-3** Yolcu sayısı 1'den fazlaysa mesajda kişi başı ve toplam birlikte yazılır. Eşik kişi
  başınadır.
- **F-4** Varsayılan eşik 1.500 TL'dir; her takipte değiştirilir.
- **F-5** **Tazelik:** kaynağın fiyatı gördüğü an 72 saatten eskiyse gözlem fırsat sayılmaz
  (takip başına ayarlanabilir). Faz 0 ölçümünde kayıtların rotaya göre %48–%95'i 72 saatten tazeydi.
- **F-6** Her bildirim fiyatın ne zaman görüldüğünü ("X saat önce görüldü"; V-7) ve "satın almadan
  önce fiyatı doğrulayın" uyarısını taşır. Sistem fiyat garantisi vermez.
- **F-7** Bagaj bilgisi kaynaktan gelir; "bagaj dahil" ya da "bagaj dahil değil" diye yazılır.
  Bilgi yoksa "bagaj dahil olmayabilir" yazar.
- **F-8** Olağan dışı düşük fiyat (rotanın 30 günlük ortancasının %30'undan az) "kontrol edin"
  etiketiyle gider; hata fiyatı da olabilir, veri hatası da.
- **F-9** Aktarma süzgeci: aktarmasız / en fazla 1 / fark etmez. Varsayılan: fark etmez.
- **F-10** Havayolu süzgeci: dahil listesi ya da hariç listesi. İkisi birlikte kullanılmaz.

### 7.6 Tetikler

Bir takipte birden çok tetik seçilebilir. Herhangi biri sağlanırsa fırsat oluşur; mesajda
sağlanan tetiklerin hepsi yazılır.

| Tetik | Koşul | Varsayılan |
|---|---|---|
| **Eşik** | Fiyat ≤ belirlenen tutar | 1.500 TL |
| **Dönemin en düşüğü** | Bugünün tabanı, son N günün en düşük tabanından düşük | N = 30 |
| **Düşüş yüzdesi** | Fiyat, son 14 günün ortanca tabanından en az %Y düşük | Y = 20 |
| **Takibin en düşüğü** | Takip başladığından beri görülen en düşük fiyat | Kapalı |

- **A-1** Karşılaştırmalar aynı rota ve aynı takip penceresi içinde yapılır. Mayıs uçuşunun fiyatı
  ağustos uçuşlarıyla kıyaslanmaz.
- **A-2** "Dönemin en düşüğü" ve "düşüş yüzdesi" için en az 10 farklı günde gözlem gerekir. Yoksa
  bu tetikler çalışmaz ve panelde "veri birikiyor (7/10 gün)" yazar. Yeterli veri olmadan "30
  günün en ucuzu" denmez.
- **A-3** Günlük taban, gün bittikten sonra değişmez. Gün içinde yeni düşük görülürse güncellenir.
- **A-4** Belirli bir uçuş tarihinin fiyat geçmişi ayrıca tutulur (rota analizi ekranı için).

### 7.7 Bildirim kuralları

- **B-1** Fırsat anahtarı: takip + kalkış + varış + gidiş tarihi (+ dönüş tarihi). Aynı fırsat
  ikinci kez bildirilmez.
- **B-2** Aynı fırsat yeniden ancak fiyat son bildirilen fiyattan **en az %5 ve en az 50 TL** daha
  düştüyse bildirilir.
- **B-3** Bir tur, bir takip için **tek mesaj** üretir: en ucuz 5 seçenek sıralı, altında "+N
  seçenek daha, panelde".
- **B-4** Bir takip günde en fazla 10 bildirim üretir (ayarlanabilir). Sınır dolunca kalanlar
  günlük özete girer.
- **B-5** Sessiz saat yoktur. Bildirim, fırsatın bulunduğu turda, günün hangi saati olursa olsun
  hemen gönderilir; bekletilmez.
- **B-6** Kanal seçimi takip bazındadır. Varsayılan: Telegram + e-posta; WhatsApp isteğe bağlı.
- **B-7** Gönderim kanal bazında kaydedilir. Bir kanal başarısızsa yalnızca o kanal sonraki turda
  yeniden denenir.
- **B-8** E-posta arızasında Telegram teknik grubuna uyarı gider: ilk hatada, sonra 24 saatte bir;
  3 gün sonra o mesajdan vazgeçilir.
- **B-9** Her mesajda: rota (havalimanı adlarıyla), tarih(ler), fiyat, havayolu, aktarma, hangi
  tetik sağlandı, fiyat kaç saat önce görüldü (V-7), satın alma bağlantısı, havayolu sitesi
  bağlantısı, panel bağlantısı. Satın alma bağlantısı ortaklık bağlantısıysa nereye gittiği yazılır.
- **B-10** Bağlantılar yalnızca `https` olur. Mümkünse iki bağlantı verilir: fiyatın görüldüğü
  kaynak ve havayolunun kendi sitesi.
- **B-11** Günlük özet (e-posta, 08:00'den sonraki ilk tur): önceki günün fırsatları, takip
  durumları, sorunlar. Anlatacak bir şey yoksa gönderilmez.
- **B-12** Haftalık özet (pazartesi): takip başına haftanın en düşük fiyatı ve yönü.
- **B-13** Teknik uyarılar yalnızca Telegram teknik grubuna gider; WhatsApp'a gitmez.
- **B-14** Bildirim kanalı yokken de turlar çalışır. Bulunan fırsatlar kasaya yazılır ve panelin Fırsatlar
  ekranında görünür; gönderim denenmez ve hiçbir fırsat "gönderildi" sayılmaz. Bir kanal sonradan
  bağlandığında o kanala yalnızca son 24 saatte bulunan fırsatlar gönderilir; daha eski fırsatlar
  gönderilmez, gönderilmiş olarak da kaydedilmez. Eski bir fırsatın fiyatı B-2'deki kadar düşerse yeni
  fırsat sayılır ve gönderilir. Gönderimi denenip başarısız olan fırsat bu kuralın dışındadır (B-7, B-8).

Mesaj başlıkları:

| Başlık | Ne zaman |
|---|---|
| `[UCUZ BİLET]` | Eşik tetiği |
| `[30 GÜNÜN EN UCUZU]` | Dönemin en düşüğü tetiği (N değişirse başlık da değişir) |
| `[FİYAT DÜŞTÜ]` | Düşüş yüzdesi tetiği ya da B-2 yeniden bildirimi |
| `[KAMPANYA]` | Yeni ya da değişen kampanya |
| `[TAKİP BİTTİ]` | Takibin süresi doldu |
| `[KAYNAK HATASI]` | Bir kaynak 24 saatten uzun okunamadı (teknik grup) |

Telegram mesajı örneği:

```
[UCUZ BİLET] Sabiha Gökçen → Erzurum
14 Mayıs Perşembe · 1.249 TL · Pegasus · aktarmasız
Eşik: 1.500 TL · son 30 günün en düşüğü
Fiyat 3 saat önce görüldü; satın almadan önce havayolu sitesinde doğrulayın.
Bagaj dahil olmayabilir.

Diğer günler: 12 May 1.310 TL · 19 May 1.340 TL  (+4 seçenek, panelde)
Satın al: <bağlantı>   Panel: <bağlantı>
```

### 7.8 Kampanya kuralları

- **C-1** Kampanya kimliği: havayolu + kampanya bağlantısı. Aynı kampanya bir kez bildirilir.
- **C-2** Başlık, tarih aralığı ya da fiyat değişirse "güncellendi" olarak bir kez daha bildirilir.
- **C-3** Kampanya metninden çıkarılabilenler: başlık, "…TL'den başlayan" fiyat, satış ve uçuş
  tarih aralıkları, rotalar. Çıkarılamayan alan boş bırakılır, tahmin edilmez.
- **C-4** Takipte kalkış süzgeci varsa ve kampanya rotaları okunabiliyorsa yalnızca ilgili
  kampanyalar bildirilir. Rotalar okunamıyorsa kampanya "rota belirsiz" etiketiyle gider.
- **C-5** Kampanya bildirimi de bulunduğu turda hemen gönderilir (B-5).
- **C-6** Sayfa yapısı değişip hiç kampanya okunamazsa bu "kampanya yok" sayılmaz, kaynak hatası
  sayılır.

### 7.9 Sorgu planı ve bütçe

"Nisan–Haziran, iki havalimanından, her yere" gibi bir takip yüzlerce sorgu demektir. Ücretsiz
sınırlar içinde kalmak için:

- **P-1** Tur başına sorgu bütçesi vardır (başlangıç: 60 çağrı, saniyede en fazla 1). Gerçek sınır
  Faz 0'da ölçüldü: kaynak dakikada 300–600 isteğe izin veriyor; 60 çağrı bunun çok altında.
- **P-2** Aynı kalkış-varış-ay sorgusu isteyen takipler tek sorguyu paylaşır.
- **P-3** Mümkün olan yerde "ay takvimi" türü uçlar kullanılır (tek çağrıda bir ayın günlük en
  düşükleri); tek tek gün sorgulanmaz.
- **P-4** Öncelik sırası: en uzun süredir taranmayan takip → gidiş tarihi yakın olan → son
  fiyatı eşiğe yakın olan.
- **P-5** Bütçe yetmezse kalan sorgular sonraki tura kalır. Her takibin "son tarama" zamanı
  panelde görünür.
- **P-6** Tazelik hedefi: 30 gün içindeki uçuşlar her turda, 30–90 gün arası 2 saatte bir, daha
  uzağı 6 saatte bir. Bütçe yetmezse hedefler orantılı gevşer.
- **P-7** Bir takip tek başına bütçenin yarısından fazlasını kullanamaz.
- **P-8** Sınırlar: en fazla 50 etkin takip, takip başına en fazla 4 kalkış ve 4 belirli varış
  havalimanı.

### 7.10 Takibin yaşam döngüsü

```
taslak → etkin ⇄ duraklatıldı
           │
           ├→ süresi doldu   (tarih penceresi geçti; kendiliğinden)
           └→ silindi        (kullanıcı; geçmişi 30 gün sonra temizlenir)
```

- **Y-1** Takip düzenlenince fırsat geçmişi korunur; eşik düşürüldüyse eski fırsatlar yeniden
  bildirilmez.
- **Y-2** Kalkış, varış ya da tarih penceresi değişirse takip yeni sayılır: analiz verisi yeniden
  birikir (rota aynı kalıyorsa birikmiş taban verisi kullanılır).
- **Y-3** Duraklatılan takip sorgulanmaz ve bildirim üretmez; verisi durur.

### 7.11 Veri saklama

- **S-1** Ham gözlemler 90 gün saklanır.
- **S-2** Günlük tabanlar 400 gün saklanır (yıllık karşılaştırma için).
- **S-3** Gönderim kayıtları 180 gün saklanır.
- **S-4** Gözlem yalnızca fiyat değiştiyse ya da son kayıttan 24 saat geçtiyse yazılır (D1 yazma
  sınırını korumak için).
- **S-5** Temizlik günde bir kez, gece turunda yapılır.

---

## 8. Arayüz

### 8.1 Ekranlar

| Ekran | İçerik |
|---|---|
| **Takipler** | Kartlar: ad, rota özeti, tarih özeti, son fiyat, son tarama, durum. Duraklat, düzenle, sil, çoğalt. |
| **Takip formu** | Aşağıdaki girdiler. Kaydetmeden önce "bu takip şunu izleyecek" diye düz Türkçe özet gösterir. |
| **Fırsatlar** | Bulunan fırsatların akışı; takibe, rotaya, uçuş ayına göre süzme; fiyatın yaşı ve hangi kanallara gönderildiği. Kanal yokken fırsatlara buradan bakılır (B-14). |
| **Rota analizi** | Fiyat geçmişi çizgisi, ay takvimi (gün başına en düşük fiyat, renkle), en ucuz günler. |
| **Kampanyalar** | Havayoluna göre etkin kampanyalar. |
| **Ayarlar** | Varsayılan eşik, günlük bildirim sınırı, varsayılan kanallar. |
| **Durum** | Son tur, son turların listesi, son 24 saatte görülen fırsat sayısı, kaynakların durumu, sorgu bütçesi, kanalların durumu. |

Telefon ekranı önceliklidir; her ekran 360 piksel genişlikte yatay kaydırma olmadan çalışır.

### 8.2 Takip formu girdileri

| Girdi | Tür | Zorunlu | Varsayılan | Doğrulama |
|---|---|---|---|---|
| Ad | Metin | Evet | Rotadan türetilir | 1–60 karakter |
| Tür | Seçim | Evet | Bütçe | 7.2'deki beş tür |
| Kalkış havalimanları | Çoklu seçim | Evet | – | 1–4, listeden |
| Varış | Çoklu seçim ya da kapsam | Türe göre | – | Havalimanı (1–4), ülke, "yurt içi", "yurt dışı", "her yer" |
| Yön | Seçim | Evet | Tek yön | Tek yön / gidiş-dönüş |
| Tarih biçimi | Seçim | Evet | Sürekli | Aralık / aylar / sürekli |
| Gidiş başlangıç–bitiş | Tarih | Aralıkta | – | Bugün ya da sonrası; bitiş ≥ başlangıç; en fazla 330 gün ileri |
| Aylar | Çoklu seçim | Aylarda | – | Geçmiş ay seçilemez |
| Sürekli pencere | Sayı (gün) | Süreklide | 90 | 7–330 |
| Haftanın günleri | Çoklu seçim | Hayır | Hepsi | – |
| Dönüş başlangıç–bitiş | Tarih | Gidiş-dönüşte, biri | – | Gidiş başlangıcından sonra |
| Kalış süresi | Sayı aralığı (gece) | Gidiş-dönüşte, biri | – | 0–60; en az ≤ en çok |
| Farklı havalimanına dönüş | Onay kutusu | Hayır | Kapalı | – |
| Yolcu sayısı | Sayı | Evet | 1 | 1–9 |
| Aktarma | Seçim | Evet | Fark etmez | Aktarmasız / en fazla 1 / fark etmez |
| Havayolu | Dahil ya da hariç listesi | Hayır | Hepsi | İkisi birlikte olmaz |
| Kalkış saati | Saat aralığı | Hayır | Tüm gün | – |
| Tetikler | Çoklu seçim | Evet, en az 1 | Eşik | 7.6 |
| Eşik (TL) | Sayı | Eşik seçiliyse | 1.500 | 100–100.000 |
| Dönem (gün) | Sayı | Dönemin en düşüğünde | 30 | 7–180 |
| Düşüş yüzdesi | Sayı | Düşüş yüzdesinde | 20 | 5–80 |
| Kanallar | Çoklu seçim | Evet, en az 1 | Telegram + e-posta | Yalnızca kurulu kanallar seçilebilir |
| Günlük bildirim sınırı | Sayı | Hayır | 10 | 1–20 |

Form kuralları:

- Her girdi sunucuda yeniden doğrulanır.
- Kaydetmeden önce tahmini sorgu yükü gösterilir ("bu takip tur başına yaklaşık 12 sorgu
  kullanır"); P-7'yi aşan takip kaydedilmez, nasıl daraltılacağı söylenir.
- Form taslağı tarayıcıda tutulur; kaydedilen takip yalnızca kasada durur.

### 8.3 Veri modeli (D1)

| Tablo | İçerik | Ana alanlar |
|---|---|---|
| `takip` | Takip tanımları | kimlik, ad, tür, durum, kalkış listesi, varış tanımı, yön, tarih tanımı, süzgeçler, tetikler, kanallar, sınırlar, oluşturma, güncelleme, son tarama |
| `gozlem` | Ham fiyat kayıtları | kalkış, varış, gidiş tarihi, dönüş tarihi, fiyat, havayolu, aktarma, kaynak, kaynağın gördüğü an, okunma anı, bağlantı, belirsizlik etiketi, bagaj bilgisi |
| `gunluk_taban` | Rota ve gün bazında en düşük | rota, uçuş ayı, gün, en düşük fiyat |
| `firsat` | Takibe düşen fırsatlar | takip, fırsat anahtarı, fiyat, sağlanan tetikler, ilk görülme, son görülme, son bildirilen fiyat, durum |
| `gonderim` | Kanal bazında gönderim | fırsat ya da mesaj anahtarı, kanal, durum, deneme sayısı, zaman |
| `kampanya` | Kampanyalar | havayolu, başlık, özet, fiyat, tarih aralıkları, bağlantı, içerik özeti, ilk ve son görülme |
| `kaynak_durum` | Kaynak sağlığı | kaynak, son başarı, son hata, art arda hata sayısı |
| `tur` | Son turların özeti | zaman, durum, süre, sayılar |
| `ayar` | Genel ayarlar | anahtar, değer |

Şema değişiklikleri numaralı göç dosyalarıyla yapılır (`kasa/gocler/0001_….sql`); elle tablo
değiştirilmez.

### 8.4 Tasarım

Önceki projenin tasarım dili aynen kullanılır.

| Belirteç | Açık tema | Koyu tema |
|---|---|---|
| `--sign` (logo zemini, başlık) | `#0d5546` | `#0f5e4e` |
| `--brand` (düğme, seçili) | `#14735f` | `#178066` |
| `--brand-ink` (bağlantı) | `#0f5e4e` | `#6fd4b4` |
| `--brand-soft` (seçili zemin) | `#e7f4ef` | `#10302a` |
| `--bg` | `#f2f5f3` | `#08100e` |
| `--surface` | `#ffffff` | `#0f1916` |
| `--text` | `#0e1f1a` | `#e3ebe8` |
| `--muted` | `#5f716b` | `#93a6a0` |
| `--line` | `#e1e8e4` | `#1f2e29` |
| `--ok` | `#15803d` | `#4ade80` |
| `--warn` | `#b45309` | `#fbbf24` |
| `--danger` | `#b42318` | `#f87171` |

- Yazı tipleri: **Inter** (metin) ve **Overpass** (rakamlar, başlıklar; `tabular-nums`). İkisi de
  OFL lisanslı ve depoda gömülüdür; dışarıdan yüklenmez.
- Aralıklar 4 / 8 / 12 / 16 / 24 / 32 / 48 piksel; köşe yarıçapları 6 / 10 / 16 piksel.
- Açık ve koyu tema; sistem ayarını izler, elle değiştirilebilir.
- Logo: aynı biçimde yeşil (`#0d5546`) yuvarlak köşeli kare, içinde beyaz simge. Simge bu projeye
  özel olacak (14. bölüm, karar 4).
- E-posta şablonları önceki projenin yeşil resmî tasarımından türetilir: tablo tabanlı, satır içi
  stil, koyu tema sınıfları, Outlook için düz renk yedeği, CID ile gömülü logo. Önceki projenin
  şablon dosyaları değiştirilmez; kopyalanıp uyarlanır.

---

## 9. Güvenlik ve herkese açık depo

### 9.1 Depoya girenler ve girmeyenler

| Depoda | Depo dışında |
|---|---|
| Kod, testler, şablonlar | `.env` (yalnızca `.env.example` girer) |
| Havalimanı ve havayolu listeleri | Anahtarlar, şifreler, telefon numaraları, sohbet kimlikleri, e-postalar |
| İş akışları, worker kodları, göç dosyaları | Takipler, gözlemler, fırsatlar (D1'de) |
| Belgeler (kişisel bilgi içermeden) | Grafana yığın adresi ve kullanıcı numarası |
| | Yerel notlar, kişisel klasör yolları |

`.gitignore` en az şunları kapsar: `.env`, `.env.*` (`.env.example` hariç), `*.pem`, `*.key`,
`.venv/`, `__pycache__/`, `node_modules/`, `.wrangler/`, `.dev.vars`, yerel not ve hatırlatma
dosyaları, `*.log`, `_site/`, `cache/`.

### 9.2 Commit kimliği (D-1, D-2)

Depo açılırken bir kez:

1. `git config user.name` → GitHub kullanıcı adı; `git config user.email` → GitHub'ın `noreply`
   adresi.
2. GitHub → Settings → Emails: "Keep my email addresses private" ve "Block command line pushes
   that expose my email" açık.
3. Yerel `commit-msg` kancası: mesajda yerel yasaklı ifade listesinden bir ifade varsa commit'i
   reddeder. Liste depoya girmez.
4. İş akışında commit denetimi: son commit'lerde `noreply` olmayan e-posta ya da istenmeyen satır
   varsa test başarısız olur.

Doğrulama, her yayından sonra:

```
gh api repos/<sahip>/<depo>/contributors --jq '.[].login'
```

Çıktı yalnızca depo sahibinin kullanıcı adı olmalıdır. Bu projede GitHub Actions depoya commit
atmaz (veri D1'de), dolayısıyla listede bot da görünmez.

### 9.3 Yayın öncesi tarama

Önceki projedeki `python -m radar yayinla` buraya taşınır. Her gönderimden önce depoya girecek
tüm dosyalarda şunları arar; tek bulgu varsa hiçbir şey gönderilmez ve değerin kendisi değil,
dosya ve satır gösterilir:

- `.env`'deki her değer (anahtar, sohbet kimliği, numara, e-posta)
- Bilinen anahtar biçimleri (Telegram, GitHub, Grafana `glc_`/`glsa_`, Meta, özel anahtar blokları)
- Kişisel klasör yolu ve kişisel e-posta
- Yerel yasaklı ifade listesindeki ifadeler (dosya içinde ve dosya adında)

### 9.4 Depo ve iş akışı sıkılaştırma

- Gizli bilgi taraması ve gönderim koruması (push protection) açık.
- Ana dal silinemez, geçmişi yeniden yazılamaz.
- Issue, wiki, proje, tartışma kapalı; dışarıdan yorum ve PR sınırlı.
- İş akışlarında `permissions: {}` varsayılan; her iş yalnızca gerekeni alır. Bu projede radar
  işi `contents: read` ile yetinir.
- Actions yalnızca GitHub'ın kendi eylemlerini çalıştırır; eylemler commit SHA ile sabitlenir.
- `pip install --require-hashes`; bağımlılıklar `requirements.in` → `requirements.txt`.
- Test iş akışı hiçbir gizli bilgiye erişmez.
- Bağımlılık güvenlik uyarıları açık.

### 9.5 Anahtarlar

| Anahtar | Nerede durur | Yetki | Not |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_TECH_CHAT_ID` | `.env`, GitHub Secrets | Mesaj gönderme | Bot anahtarı Grafana alarm kanalında da durur; yenilerken iki yerde değişir |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TO`, `WHATSAPP_TEMPLATE` | `.env`, GitHub Secrets | Mesaj gönderme | Kalıcı system user anahtarı |
| `SMTP_*`, `EMAIL_TO` | `.env`, GitHub Secrets | E-posta gönderme | Gmail uygulama şifresi |
| `LOKI_URL`, `LOKI_USER`, `LOKI_TOKEN` | `.env`, GitHub Secrets | Yalnızca `logs:write` | Bu projeye özel anahtar |
| `KASA_URL`, `RADAR_API_TOKEN` | `.env`, GitHub Secrets, kasa worker secret | Yalnızca `/api/ic/*` | Rastgele, en az 32 bayt |
| Fiyat kaynağı anahtarı | `.env`, GitHub Secrets | Okuma | |
| `GH_TOKEN` | Yalnızca Cloudflare (zamanlayıcı worker secret) | Yalnızca bu depo, Actions R/W | 1 yıl; bitiş tarihi takvime yazılır |
| Panel giriş parolası özeti ve oturum anahtarı | Yalnızca Cloudflare (kasa worker secret) | – | `kasa/araclar/gizliler.mjs` ile girilir |

- Her anahtar `guvenlik.SECRET_ENV_KEYS` listesine eklenir; `redact()` hepsini maskeler.
- Sızıntı şüphesinde anahtar hemen iptal edilip yenilenir; "belki sızmamıştır" denmez.
- GitHub, Cloudflare, Grafana, Meta ve Google hesaplarında iki adımlı doğrulama açık olur.

---

## 10. Ücretsiz katman bütçesi

| Servis | Kullandığımız | Ücretsiz sınır (**Faz 0'da doğrulanacak**) | Beklenen kullanım |
|---|---|---|---|
| GitHub Actions | Radar turları, testler | Herkese açık depoda standart çalıştırıcılar ücretsiz | Günde 48 tur × 1–2 dk |
| Cloudflare Workers | Zamanlayıcı + kasa | Günde 100.000 istek; istek başına kısa işlemci süresi | Günde birkaç yüz istek |
| Cloudflare D1 | Veritabanı | 5 GB; günlük okuma ve yazma satır sınırları | Günde on binlerce satırın altında (S-4) |
| Grafana Cloud | Log, pano, alarm | 14 gün log; önceki projeyle ortak yığın | Tur başına 10–30 satır |
| Telegram Bot API | Bildirim | Ücretsiz | – |
| WhatsApp Cloud API | Bildirim | Test numarası, 5 alıcı | – |
| Gmail SMTP | Bildirim | Günlük gönderim sınırı | Günde birkaç e-posta |
| Travelpayouts | Fiyat verisi | Ücretsiz; ölçülen sınır dakikada 300–600 istek | Tur başına ≤ 60 çağrı |

Herkese açık depolarda GitHub, 60 gün hareketsiz kalınca **zamanlanmış** iş akışlarını durdurur.
Asıl tetikleme dışarıdan geldiği için etkilenmez; yedek cron durabilir. Önceki projede bunu veri
commit'leri önlüyordu; burada veri commit'i yoktur, dolayısıyla yedek cron'un durabileceği
bilinmelidir.

---

## 11. Depo düzeni

```
.github/workflows/radar.yml        30 dakikalık tur (dış tetik + yedek cron)
.github/workflows/testler.yml      testler + commit denetimi
radar/                             Python motoru
  cli.py                           komutlar
  kasa.py                          kasa istemcisi
  kaynaklar/                       fiyat kaynağı arayüzü ve uygulamaları
  kampanya.py                      kampanya sayfaları
  plan.py                          sorgu planı ve bütçe
  kurallar.py                      süzgeçler ve tetikler
  notify.py, messages.py           kanallar ve mesaj metinleri
  eposta.py, eposta_sablon/        e-posta şablonları
  guvenlik.py, izleme.py, yayin.py önceki projeden
  veri/havalimanlari.json          sabit liste
kasa/                              Cloudflare worker: API + D1 göçleri
panel/                             arayüz dosyaları (kasa worker'ı sunar)
tetikleyici/                       zamanlayıcı worker + kurulum belgesi
grafana/                           kurallar, şablonlar, uygulama betiği
tests/
.env.example
README.md, MIMARI.md, IZLEME_MIMARISI.md
```

---

## 12. Test ve kabul

- Her iş kuralı (7. bölümdeki kimlikler) en az bir testle karşılanır; test adında kural kimliği
  geçer (ör. `test_H3_sehir_kodu_sonucu_suzulur`).
- Ağ çağrıları testlerde taklit edilir; testler internete çıkmaz ve gizli bilgi istemez.
- Tarih ve saat testleri sabit bir "şimdi" ile çalışır; Türkiye saati ve gün dönümü sınırları
  ayrıca sınanır.
- Güvenlik testleri: `redact()` tüm anahtarları maskeliyor mu; günlük ve Loki kayıtlarında rota,
  tarih, alıcı var mı (olmamalı); yayın taraması örnek sızıntıları yakalıyor mu.
- Canlıya almadan önce uçtan uca tatbikat: sahte bir düşük fiyat gözlemi → üç kanala bildirim →
  kasada kayıt → Grafana'da satır.

---

## 13. Yol haritası

Her faz, kabul ölçütü sağlanmadan bitmiş sayılmaz.

### Faz 0 · Veri kanıtı (kod yazmadan önce)

Amaç: ücretsiz kaynakla bu projenin yapılıp yapılamayacağını görmek.

1. Travelpayouts hesabı açılır; anahtar `.env`'ye yazılır (G-4).
2. 12–15 rota sınanır: yurt içi (SAW–ERZ, IST–ADB, SAW–AYT, SAW–TZX, IST–GZT…), yurt dışı
   (IST–BER, SAW–AMS, IST–LHR…), Pegasus ve AJet ağırlıklı.
3. Her rotada bakılacaklar:
   - Veri geliyor mu, kaç gün için?
   - Gerçek kalkış ve varış havalimanı alanı var mı (H-3, H-4)?
   - Fiyat TL geliyor mu (V-3)?
   - Fiyat ne kadar eski (F-5)?
   - Aynı uçuşun havayolu sitesindeki fiyatıyla fark ne kadar?
4. İstek sınırı ve kullanım şartları okunur: düzenli otomatik sorgu serbest mi (V-4)?
5. Kampanya sayfaları: dört havayolunun sayfası GitHub Actions'tan okunabiliyor mu, `robots.txt`
   ne diyor?
6. Cloudflare Access ve D1 ücretsiz koşulları, kredi kartı gereksinimi (Ü-2).

Kabul ölçütü: sınanan yurt içi rotaların en az %70'inde veri var, havalimanı alanı dolu, fiyatlar
48 saatten taze ve gerçek fiyattan sapma ortanca olarak %10'un altında.

**Faz 0 sonucu (17 Kasım 2026).**

- Travelpayouts REST uçları tek başına ölçütü geçemedi: IST ve SAW ayrılamıyor, tazelik düşük.
- GraphQL arayüzü IST ve SAW'ı ayırıyor; sınanan sekiz rotanın hepsinde veri, havalimanı alanı ve
  TL fiyat geldi. Birincil kaynak oldu (6. bölüm).
- Tazelik rotaya göre değişiyor (ortanca yaş 7–77 saat); eşik 72 saat yapıldı (F-5).
- "Ortanca sapma < %10" ölçütü henüz ölçülmedi.

Ölçüt sağlanmazsa seçenekler: yalnızca kampanya radarıyla başlamak, eşikleri gevşetmek ya da başka
bir ücretsiz kaynak aramak. Ücretli kaynağa geçilmez (Ü-1).

### Faz 1 · İskelet ve güvenlik

Depo, kimlik ayarları (9.2), `.gitignore`, kancalar, test iş akışı, yayın taraması, `.env.example`.
Kabul: boş iskelet herkese açık depoda; katkıda bulunanlar listesinde tek hesap; tarama örnek
sızıntıyı yakalıyor.

### Faz 2 · Kasa ve takip formu

D1 şeması, kasa worker'ı, giriş koruması, takipler ekranı ve form.
Kabul: telefondan takip eklenip düzenlenebiliyor; girişsiz hiçbir uç veri vermiyor; radar anahtarı
olmadan `/api/ic/*` 401 dönüyor.

### Faz 3 · Motor (bildirimsiz)

Kaynak arayüzü, sorgu planı, süzgeçler, tetikler, `--deneme` modu.
Kabul: 1. bölümdeki ilk dört örnek istek için deneme turu doğru fırsatları listeliyor; 7.
bölümdeki her kuralın testi geçiyor.

Durum (17 Kasım 2026): kaynak arayüzü, Travelpayouts GraphQL kaynağı, sorgu planı (P-1, P-2, P-4, P-5, P-7), süzgeçler
(H-3, H-4, H-5, T-2…T-5, T-7, F-5, F-9, F-10), eşik tetiği, yeniden bildirim (B-1, B-2) ve `--deneme` kipi yazıldı ve
testleri geçiyor. Henüz yok: dönemin en düşüğü, düşüş yüzdesi ve takibin en düşüğü tetikleri (taban verisi birikince),
olağan dışı düşük fiyat etiketi (F-8), tazelik kademeleri (P-6), havayolu–havalimanı tutarlılık denetimi (V-8) ve
gidiş-dönüşte dönüş havalimanı denetimi (H-6; kaynak dönüş havalimanını vermiyor). Gidiş-dönüş ve geniş kapsamlı
sorgular gerçek kaynakla henüz denenmedi.

### Faz 4 · Bildirimler

Sırayla Telegram, e-posta, WhatsApp; şablonlar; tekrar önleme; günlük sınır; özetler.
Kabul: tatbikat fırsatı üç kanala bir kez gidiyor; aynı fırsat ikinci turda gitmiyor; bir kanal
bozulduğunda yalnızca o kanal yeniden deneniyor.

Durum (17 Kasım 2026): bildirim kanalları en sona bırakıldı; turlar kanalsız çalışır ve fırsatlar panelde
görünür (B-14). Telegram gönderimi, takip başına tek mesaj (B-3), mesaj içeriği (B-9, B-10), günlük sınır (B-4)
ve kanal bazında gönderim kaydı (B-7) yazıldı ve sınandı, ama gerçek bir bot bağlanmadı. Henüz yok: e-posta, WhatsApp, günlük ve haftalık özetler (B-11, B-12),
e-posta arızası uyarısı (B-8) ve teknik gruba kaynak hatası mesajı.

### Faz 5 · Zamanlayıcı ve izleme

Cloudflare zamanlayıcı, Grafana panosu ve kuralları, alarm tatbikatı.
Kabul: 24 saatte beklenen turların tamamı çalışmış; alarm tatbikatı Telegram ve e-postaya ulaşmış;
geçici yönetici anahtarları silinmiş.

### Faz 6 · Kampanya radarı ve analiz ekranları

Kampanya sayfaları, rota analizi, fırsatlar akışı, durum ekranı.

---

## 14. Kararlar (17 Kasım 2026'da verildi)

| # | Karar | Sonuç |
|---|---|---|
| 1 | Sistem tek kişi için mi, birkaç kişi için mi? | Tek sahip; alıcılar (en fazla 5 WhatsApp numarası, bir Telegram grubu) ortak. Veri modelinde kullanıcı alanı baştan bulunur. |
| 2 | Bildirimler için yeni Telegram botu, yeni grup ve yeni gönderici e-postası mı? | Evet, hepsi yeni; önceki projeden ayrı. |
| 3 | Proje ve depo adı | "Flight Ticket", depo `flight-ticket`, Grafana etiketi `app="flight-ticket"`. Bildirimlerde ve panelde görünen ad da budur. Cloudflare worker (`flight-ticket-radar-kasa`) ve D1 veritabanı (`flight-ticket-radar`) adları ilk hâliyle kalır. |
| 4 | Logo simgesi | Yeşil kare içinde beyaz, sade bir uçak ve fiyat/iniş çizgisi; birkaç taslak sunulur |
| 5 | Satın alma bağlantısı ortaklık (komisyon) bağlantısı olabilir mi? | Kaynak şartı gerektiriyorsa evet; mesajda bağlantının nereye gittiği yazılır |
| 6 | Panel girişi | Worker içi tek kullanıcılı giriş. Cloudflare Access, ücretsiz planda da ödeme yöntemi istediği bildirildiği için kullanılmıyor. |
| 7 | Varsayılan sessiz saatler ve günlük sınır | Sessiz saat yok; bildirim bulunduğu turda hemen gider. Günlük sınır takip başına 10. |
| 8 | Fiyatlar canlı mı olacak? | Canlı fiyat kurallara uygun biçimde ücretsiz alınamıyor. Fiyatlar önbellek (Travelpayouts) ve fiyat uyarısı e-postalarından gelir; her bildirimde fiyatın yaşı yazar. Kesin fiyat havayolu sitesinde doğrulanır. Fiyat uyarısı e-postaları yolu çalışırsa bu karar yeniden güncellenir. |

Hâlâ açık olan: Google Flights fiyat uyarısı e-postalarının ek kaynak olarak kullanılıp
kullanılmayacağı (örnek e-postalarla sınanacak).

---

## 15. Doğrulanmamış varsayımlar

Henüz sınanmamış olanlar. Sınandıkça bu listeden çıkar; yanlış çıkan varsayım belgede düzeltilir.

1. Düzenli otomatik sorgunun kaynak şartlarına uygun olduğu; ortaklık bağlantısının zorunlu olup
   olmadığı.
2. Kaynak fiyatlarının havayolu sitesindeki fiyata yakın olduğu (ortanca sapma < %10).
4. Havayolu kampanya sayfalarının GitHub'ın yurt dışı IP'lerinden okunabildiği ve `robots.txt`
   ile yasaklanmadığı.
5. Meta'nın bilet fırsatı şablonunu onaylayacağı.
6. Grafana ücretsiz planının iki projenin loglarını birlikte taşıyabildiği.
7. Fiyat uyarısı e-postalarının rota, tarih ve fiyatı güvenilir biçimde okunabilir taşıdığı.
