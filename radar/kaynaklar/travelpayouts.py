"""Travelpayouts (Aviasales verisi) GraphQL kaynağı.

- Fiyatlar canlı değildir: başka kullanıcıların aramalarından gelen önbellek. Her gözlem `gorulme` anını taşır.
- Kalkış her zaman havalimanı türüyle sorulur (H-3): IST ve SAW ayrıdır.
- Fiyat TL istenir; TL gelmezse kaynak yetersiz sayılır (V-3). Kur çevrilmez.
- İstekler arasında en az bir saniye beklenir; 429 gelirse KaynakHatasi(kod=429) fırlatılır (V-4).
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from .. import http
from ..guvenlik import redact, safe_url
from . import Gozlem, KaynakHatasi, Sorgu

ADRES = "https://api.travelpayouts.com/graphql/v1/query"
SATIS_SITESI = "https://www.aviasales.com"
EN_FAZLA_KAYIT = 400
ALANLAR = ("departure_at return_at origin_airport_iata destination_airport_iata value currency main_airline "
           "number_of_changes found_at with_baggage ticket_link segments { flight_legs { flight_number } }")


def _metin(deger: str) -> str:
    """GraphQL metin değeri: yalnızca harf, rakam ve tire kabul edilir (girdi sabit listelerden gelir)."""
    if not deger or not all(k.isalnum() or k == "-" for k in deger):
        raise ValueError("geçersiz sorgu değeri")
    return f'"{deger}"'


def sorgu_metni(s: Sorgu) -> str:
    p = [f"origin:{_metin(s.kalkis)}", "origin_type:AIRPORT", f"depart_date_min:{_metin(s.bas)}", f"depart_date_max:{_metin(s.bit)}"]
    if s.varis_tur == "havalimani":
        p += [f"destination:{_metin(s.varis)}", "destination_type:AIRPORT"]
        grup = "DEPART_DATE"
    elif s.varis_tur == "ulke":
        p += [f"destination:{_metin(s.varis)}", "destination_type:COUNTRY"]
        grup = "DIRECTIONS"
    else:
        grup = "DIRECTIONS"
    alan = "prices_one_way"
    if s.yon == "gidis-donus":
        alan = "prices_round_trip"
        if s.donus_bas and s.donus_bit:
            p += [f"return_date_min:{_metin(s.donus_bas)}", f"return_date_max:{_metin(s.donus_bit)}"]
        elif s.kalis_az is not None and s.kalis_cok is not None:
            p += [f"trip_duration_min:{int(s.kalis_az)}", f"trip_duration_max:{int(s.kalis_cok)}"]
    return ("{ %s(params:{%s}, grouping:%s, sorting:VALUE_ASC, paging:{limit:%d, offset:0}, currency:\"try\") { %s } }"
            % (alan, ", ".join(p), grup, EN_FAZLA_KAYIT, ALANLAR))


def _baglanti(ham) -> str | None:
    if not isinstance(ham, str) or not (ham.startswith("/") or ham.startswith("https://")):
        return None
    url = safe_url(ham if ham.startswith("https://") else SATIS_SITESI + ham)
    return url if url and url.startswith("https://") else None


def kayittan_gozlem(k: dict, okunma: datetime) -> Gozlem | None:
    """Kaynağın tek kaydını gözleme çevirir. Zorunlu alan eksikse None döner; tahmin edilmez."""
    try:
        gidis = str(k["departure_at"])
        fiyat = float(k["value"])
    except (KeyError, TypeError, ValueError):
        return None
    if len(gidis) < 10 or fiyat <= 0:
        return None
    kalkis, varis = k.get("origin_airport_iata"), k.get("destination_airport_iata")
    belirsiz = not (isinstance(kalkis, str) and len(kalkis) == 3 and isinstance(varis, str) and len(varis) == 3)
    gorulme = None
    if isinstance(k.get("found_at"), (int, float)) and k["found_at"] > 0:
        gorulme = datetime.fromtimestamp(k["found_at"], tz=timezone.utc)
    donus = k.get("return_at")
    ucus = None
    try:
        ucus = str(k["segments"][0]["flight_legs"][0]["flight_number"])
    except (KeyError, IndexError, TypeError):
        pass
    return Gozlem(
        kalkis=kalkis if not belirsiz else (kalkis or "???"), varis=varis if not belirsiz else (varis or "???"),
        gidis=gidis[:10], gidis_saat=gidis[11:16] if len(gidis) >= 16 and gidis[10] == "T" else None,
        donus=str(donus)[:10] if isinstance(donus, str) and len(donus) >= 10 else None,
        fiyat=fiyat, havayolu=k.get("main_airline") or None, ucus_no=ucus,
        aktarma=k.get("number_of_changes") if isinstance(k.get("number_of_changes"), int) else None,
        bagaj=k.get("with_baggage") if isinstance(k.get("with_baggage"), bool) else None,
        kaynak="travelpayouts", gorulme=gorulme, okunma=okunma, baglanti=_baglanti(k.get("ticket_link")), belirsiz=belirsiz,
    )


class Travelpayouts:
    ad = "travelpayouts"

    def __init__(self, anahtar: str, gonder: http.Gonder = http.gonder, bekle=time.sleep, aralik: float = 1.05, saat=time.monotonic):
        self.anahtar = anahtar
        self.gonder = gonder
        self.bekle = bekle
        self.aralik = aralik
        self.saat = saat
        self._son = None
        self.istek_sayisi = 0

    def _yavasla(self) -> None:
        if self._son is not None:
            kalan = self.aralik - (self.saat() - self._son)
            if kalan > 0:
                self.bekle(kalan)
        self._son = self.saat()

    def gozlemler(self, sorgu: Sorgu) -> list[Gozlem]:
        self._yavasla()
        self.istek_sayisi += 1
        try:
            kod, yanit = http.json_gonder(self.gonder, "POST", ADRES, {"X-Access-Token": self.anahtar}, {"query": sorgu_metni(sorgu)})
        except ValueError:
            raise
        except Exception as hata:
            raise KaynakHatasi(redact(f"bağlantı hatası: {type(hata).__name__}")) from None
        if kod == 429:
            raise KaynakHatasi("istek sınırı aşıldı", 429)
        if kod != 200 or not isinstance(yanit, dict):
            raise KaynakHatasi(f"kaynak {kod} döndü", kod)
        if yanit.get("errors") or not isinstance(yanit.get("data"), dict):
            raise KaynakHatasi("kaynak sorguyu reddetti", kod)
        kayitlar = next(iter(yanit["data"].values()), None) or []
        if any(isinstance(k, dict) and str(k.get("currency", "")).lower() != "try" for k in kayitlar):
            raise KaynakHatasi("fiyat TL gelmedi (V-3)", kod)
        okunma = datetime.now(timezone.utc)
        return [g for g in (kayittan_gozlem(k, okunma) for k in kayitlar if isinstance(k, dict)) if g]

    def erisim_testi(self) -> tuple[bool, str]:
        """Tek, veri istemeyen bir sorguyla anahtarın çalıştığını dener."""
        self._yavasla()
        self.istek_sayisi += 1
        try:
            kod, yanit = http.json_gonder(self.gonder, "POST", ADRES, {"X-Access-Token": self.anahtar}, {"query": "{ __typename }"})
        except Exception as hata:
            return False, redact(f"bağlantı hatası: {type(hata).__name__}")
        tamam = kod == 200 and isinstance(yanit, dict) and not yanit.get("errors")
        return tamam, f"http {kod}"
