-- İlk şema. Şema değişiklikleri yalnızca numaralı göç dosyalarıyla yapılır.
-- Bu veritabanında kişisel bilgi (numara, sohbet kimliği, e-posta) tutulmaz.

CREATE TABLE takip (
  kimlik TEXT PRIMARY KEY,
  kullanici TEXT NOT NULL DEFAULT 'sahip',
  ad TEXT NOT NULL,
  tur TEXT NOT NULL,
  durum TEXT NOT NULL DEFAULT 'etkin',      -- etkin | duraklatildi | suresi-doldu | silindi
  kalkis TEXT NOT NULL,                     -- JSON: havalimanı kodları
  varis TEXT NOT NULL,                      -- JSON: kapsam, havalimanları, ülkeler
  yon TEXT NOT NULL,
  tarih TEXT NOT NULL,                      -- JSON
  donus TEXT,                               -- JSON ya da NULL
  suzgecler TEXT NOT NULL,                  -- JSON: yolcu, aktarma, havayolu, saat
  tetikler TEXT NOT NULL,                   -- JSON
  kanallar TEXT NOT NULL,                   -- JSON: yalnızca kanal adları
  gunluk_sinir INTEGER NOT NULL DEFAULT 10,
  pencere_surumu INTEGER NOT NULL DEFAULT 1, -- kalkış, varış ya da tarih değişince artar (Y-2)
  olusturma TEXT NOT NULL,
  guncelleme TEXT NOT NULL,
  son_tarama TEXT,
  son_fiyat REAL,
  silinme TEXT
);
CREATE INDEX takip_durum ON takip (durum);

CREATE TABLE gozlem (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kalkis TEXT NOT NULL,
  varis TEXT NOT NULL,
  gidis TEXT NOT NULL,
  donus TEXT,
  fiyat REAL NOT NULL,
  havayolu TEXT,
  ucus_no TEXT,
  aktarma INTEGER,
  bagaj TEXT,
  kaynak TEXT NOT NULL,
  gorulme TEXT,                             -- kaynağın fiyatı gördüğü an
  okunma TEXT NOT NULL,                     -- bizim okuduğumuz an
  baglanti TEXT,
  belirsiz INTEGER NOT NULL DEFAULT 0       -- havalimanı belirsiz (H-4)
);
CREATE INDEX gozlem_rota ON gozlem (kalkis, varis, gidis);
CREATE INDEX gozlem_okunma ON gozlem (okunma);

CREATE TABLE gunluk_taban (
  kalkis TEXT NOT NULL,
  varis TEXT NOT NULL,
  ucus_ayi TEXT NOT NULL,
  gun TEXT NOT NULL,
  en_dusuk REAL NOT NULL,
  PRIMARY KEY (kalkis, varis, ucus_ayi, gun)
);

CREATE TABLE firsat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  takip TEXT NOT NULL,
  anahtar TEXT NOT NULL,
  fiyat REAL NOT NULL,
  tetikler TEXT NOT NULL,
  ilk_gorulme TEXT NOT NULL,
  son_gorulme TEXT NOT NULL,
  son_bildirilen_fiyat REAL,
  durum TEXT NOT NULL DEFAULT 'yeni',
  ayrinti TEXT,
  UNIQUE (takip, anahtar)
);

CREATE TABLE gonderim (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anahtar TEXT NOT NULL,
  kanal TEXT NOT NULL,
  durum TEXT NOT NULL,
  deneme INTEGER NOT NULL DEFAULT 0,
  zaman TEXT NOT NULL,
  UNIQUE (anahtar, kanal)
);

CREATE TABLE kampanya (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  havayolu TEXT NOT NULL,
  baslik TEXT,
  ozet TEXT,
  fiyat REAL,
  satis_bas TEXT,
  satis_bit TEXT,
  ucus_bas TEXT,
  ucus_bit TEXT,
  baglanti TEXT NOT NULL,
  icerik_ozeti TEXT,
  ilk_gorulme TEXT NOT NULL,
  son_gorulme TEXT NOT NULL,
  UNIQUE (havayolu, baglanti)
);

CREATE TABLE kaynak_durum (
  kaynak TEXT PRIMARY KEY,
  son_basari TEXT,
  son_hata TEXT,
  art_arda_hata INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tur (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zaman TEXT NOT NULL,
  durum TEXT NOT NULL,
  tetik TEXT,
  sure_sn REAL,
  takip INTEGER,
  sorgu INTEGER,
  sorgu_hata INTEGER,
  gozlem INTEGER,
  firsat INTEGER,
  bildirim_hata INTEGER,
  butce_kalan INTEGER
);

CREATE TABLE ayar (
  anahtar TEXT PRIMARY KEY,
  deger TEXT NOT NULL
);

-- Hatalı giriş denemeleri: IP'nin kendisi değil, anahtarlı özeti tutulur.
CREATE TABLE giris_deneme (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_ozeti TEXT NOT NULL,
  zaman INTEGER NOT NULL
);
CREATE INDEX giris_deneme_ip ON giris_deneme (ip_ozeti, zaman);
