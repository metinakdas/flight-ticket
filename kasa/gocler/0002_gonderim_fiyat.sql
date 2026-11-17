-- Gönderim kaydına bildirilen fiyat eklenir: aynı fırsat ancak fiyat belirgin düşerse yeniden bildirilir (B-2).
ALTER TABLE gonderim ADD COLUMN fiyat REAL;
