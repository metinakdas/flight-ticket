# Kasa kurulumu (Cloudflare Worker + D1)

Kasa; paneli, panel API'sini ve radarın kullandığı iki ucu tek bir worker'dan sunar. Veri Cloudflare D1'de
durur. Her şey ücretsiz katmandadır; kredi kartı isteyen bir adım çıkarsa durun.

Giriş koruması worker'ın içindedir (tek kullanıcı, parola). Cloudflare Access kullanılmaz: ücretsiz planı
seçerken de ödeme yöntemi istediği bildirildiği için tercih edilmedi.

Komutlar `kasa` klasöründe, kendi terminalinizde çalıştırılır. Yükleme GitHub'dan değil, bilgisayarınızdan
elle yapılır; GitHub'a Cloudflare yönetim anahtarı konmaz.

## Bir kez

1. Bağımlılıklar: `npm ci`
2. Cloudflare girişi: `npx wrangler login` (tarayıcıda onaylanır)
3. Veritabanı: `npx wrangler d1 create flight-ticket-radar`
   Çıktıdaki `database_id` değerini not edin.
4. Yapılandırma: `wrangler.ornek.toml` dosyasını `wrangler.toml` adıyla kopyalayın ve `database_id`
   satırına 3. adımdaki değeri yazın. `wrangler.toml` depoya girmez.
5. Şema: `npx wrangler d1 migrations apply flight-ticket-radar --remote`
6. Yükleme: `npx wrangler deploy`
   Çıktıdaki `https://flight-ticket-radar-kasa.<alt-alan>.workers.dev` adresini projenin `.env` dosyasına
   `KASA_URL=` olarak yazın. Bu aşamada giriş kapalıdır: gizli değerler girilene kadar kimse giremez.
7. Gizli değerler: `node araclar/gizliler.mjs`
   Panel parolasını sorar, oturum ve radar anahtarlarını üretir, üçünü Cloudflare'e yazar ve radar
   anahtarını `.env` dosyasına ekler. Hiçbir değer ekrana yazılmaz.
8. Adresi telefonda açın, parolayla girin.

## Sonradan

| İş | Komut |
|---|---|
| Kod ya da panel değişikliğini yüklemek | `npx wrangler deploy` |
| Yeni göç dosyasını uygulamak | `npx wrangler d1 migrations apply flight-ticket-radar --remote` |
| Parolayı değiştirmek | `node araclar/gizliler.mjs --yalnizca-parola` |
| Radar anahtarını yenilemek | `node araclar/gizliler.mjs --yalnizca-radar` |
| Bütün oturumları kapatmak ve anahtarları yenilemek | `node araclar/gizliler.mjs` |

## Yerelde denemek

```
node araclar/yerel-ortam.mjs
npx wrangler d1 migrations apply flight-ticket-radar --local
npx wrangler dev --local
```

`yerel-ortam.mjs`, yalnızca yerel sunucuda geçerli rastgele değerlerle `.dev.vars` üretir (depoya girmez).
Testler: `npm test` (worker ve form kuralları; internete çıkmaz, wrangler gerektirmez).

## Güvenlik notları

- Girişsiz yalnızca giriş sayfası ve tasarım dosyaları (stil, yazı tipi, logo) açılır; diğer her yol girişe
  yönlenir, `/api/*` 401 döner.
- Oturum çerezi imzalıdır: `HttpOnly; Secure; SameSite=Strict`, 7 gün geçerli.
- IP başına 15 dakikada 5 hatalı denemeden sonra giriş kilitlenir. IP'nin kendisi saklanmaz.
- `/api/ic/*` yalnızca `RADAR_API_TOKEN` ile açılır; oturum çerezi bu uçları açmaz.
- Veritabanında telefon numarası, sohbet kimliği ya da e-posta adresi tutulmaz.
