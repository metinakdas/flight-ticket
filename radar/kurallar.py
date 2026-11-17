"""Süzgeçler ve tetikler (MIMARI.md 7.3–7.7). Kural kimlikleri yorumlarda ve test adlarında geçer."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from .config import TAZELIK_SAAT, YENIDEN_BILDIRIM_TL, YENIDEN_BILDIRIM_YUZDE
from .kaynaklar import Gozlem


@dataclass
class Firsat:
    """Bir takibin tetiğini sağlayan gözlem."""
    takip: str
    gozlem: Gozlem
    tetikler: list[str] = field(default_factory=list)
    yeniden: bool = False            # B-2: daha önce bildirilmiş, fiyat belirgin düşmüş

    @property
    def anahtar(self) -> str:        # B-1: takip + kalkış + varış + gidiş (+ dönüş)
        return f"{self.takip}|{self.gozlem.anahtar}"

    @property
    def fiyat(self) -> float:
        return self.gozlem.fiyat


def yas_saat(g: Gozlem, simdi: datetime) -> float | None:
    """Fiyatın kaynakta görülmesinden bu yana geçen saat; görülme anı yoksa None."""
    if g.gorulme is None:
        return None
    return max(0.0, (simdi - g.gorulme).total_seconds() / 3600)


def suz(takip: dict, gozlemler: list[Gozlem], simdi: datetime, ulkeler: dict[str, str], tazelik_saat: float = TAZELIK_SAAT) -> list[Gozlem]:
    """Takibin kurallarına uyan gözlemler. `ulkeler`: havalimanı kodu → ülke kodu (H-8: tek doğruluk kaynağı)."""
    pencere = takip.get("pencere") or {}
    varis = takip.get("varis") or {}
    kapsam = varis.get("kapsam")
    tarih = takip.get("tarih") or {}
    gidis_donus = takip.get("yon") == "gidis-donus"
    donus = takip.get("donus") or {}
    hy = takip.get("havayolu") or {}
    saat = takip.get("saat")
    uygun = []
    for g in gozlemler:
        if g.belirsiz:                                           # H-4: saklanır ama bildirim tetiklemez
            continue
        if g.kalkis not in takip.get("kalkis", []):              # H-1, H-3: gerçek kalkış havalimanı listede olmalı
            continue
        ulke = ulkeler.get(g.varis)                              # H-5: varış da aynı sıkılıkla süzülür
        if kapsam == "havalimani" and g.varis not in varis.get("havalimanlari", []):
            continue
        if kapsam == "ulke" and ulke not in varis.get("ulkeler", []):
            continue
        if kapsam == "yurt-ici" and ulke != "TR":
            continue
        if kapsam == "yurt-disi" and (ulke is None or ulke == "TR"):
            continue
        if not (pencere.get("bas", "") <= g.gidis <= pencere.get("bit", "")):   # T-2, T-3
            continue
        if tarih.get("bicim") == "aylar" and g.gidis[:7] not in tarih.get("aylar", []):
            continue
        if tarih.get("gunler") and date.fromisoformat(g.gidis).isoweekday() not in tarih["gunler"]:   # T-4
            continue
        if gidis_donus:                                          # T-5
            if not g.donus or g.donus < g.gidis:
                continue
            if donus.get("bicim") == "aralik":
                if not (donus.get("baslangic", "") <= g.donus <= donus.get("bitis", "")):
                    continue
            else:
                gece = (date.fromisoformat(g.donus) - date.fromisoformat(g.gidis)).days
                if not (donus.get("enAz", 0) <= gece <= donus.get("enCok", 60)):
                    continue
        elif g.donus:
            continue
        if saat and g.gidis_saat and not (saat["bas"] <= g.gidis_saat <= saat["bit"]):   # T-7: saat yoksa gözlem atılmaz
            continue
        if takip.get("aktarma") == "aktarmasiz" and g.aktarma != 0:                      # F-9
            continue
        if takip.get("aktarma") == "en-fazla-1" and (g.aktarma is None or g.aktarma > 1):
            continue
        if hy.get("kip") == "dahil" and g.havayolu not in hy.get("kodlar", []):          # F-10
            continue
        if hy.get("kip") == "haric" and g.havayolu in hy.get("kodlar", []):
            continue
        yas = yas_saat(g, simdi)                                 # F-5: görülme anı bilinmeyen ya da eski fiyat fırsat sayılmaz
        if yas is None or yas > tazelik_saat:
            continue
        uygun.append(g)
    return uygun


def firsatlari_bul(takip: dict, uygun: list[Gozlem]) -> list[Firsat]:
    """Tetikleri değerlendirir; aynı fırsat anahtarında en ucuz gözlem kalır. Fiyata göre sıralı döner.

    Şimdilik yalnızca eşik tetiği değerlendirilir. Dönemin en düşüğü ve düşüş yüzdesi en az 10 günlük
    taban verisi ister (A-2); veri birikene kadar çalışmaz.
    """
    esik = (takip.get("tetikler") or {}).get("esik") or {}
    en_ucuz: dict[str, Firsat] = {}
    for g in uygun:
        tetikler = []
        if esik.get("acik") and g.fiyat <= esik.get("tutar", 0):   # F-2: eşik kişi başı fiyata uygulanır
            tetikler.append("esik")
        if not tetikler:
            continue
        f = Firsat(takip=takip["kimlik"], gozlem=g, tetikler=tetikler)
        if f.anahtar not in en_ucuz or f.fiyat < en_ucuz[f.anahtar].fiyat:
            en_ucuz[f.anahtar] = f
    return sorted(en_ucuz.values(), key=lambda f: (f.fiyat, f.gozlem.gidis))


def _belirgin_dustu(eski, yeni: float) -> bool:
    """B-2: en az %5 ve en az 50 TL düşüş."""
    return bool(eski) and yeni <= eski * (1 - YENIDEN_BILDIRIM_YUZDE / 100) and eski - yeni >= YENIDEN_BILDIRIM_TL


def _zaman(metin) -> datetime | None:
    try:
        return datetime.fromisoformat(str(metin).replace("Z", "+00:00"))
    except ValueError:
        return None


def bildirilecekler(firsatlar: list[Firsat], gonderimler: list[dict], kanal: str,
                    onceki: dict[str, dict] | None = None, simdi: datetime | None = None) -> list[Firsat]:
    """Bu kanala şimdi gönderilecek fırsatlar.

    B-1: bu kanala gitmiş fırsat yeniden gönderilmez. B-2: fiyatı belirgin düşerse yeniden gönderilir.
    B-7: bu kanalda gönderimi başarısız olmuş fırsat yeniden denenir (B-8: en çok 3 gün).
    B-14: bu kanala hiç gönderim denenmemiş fırsat ancak son 24 saatte bulunduysa gönderilir. Kanal sonradan
          bağlandığında eski fırsatlar gönderilmez; fiyatı belirgin düşen eski fırsat yeni sayılır.
    `onceki`: kasadaki fırsat kayıtları (anahtar → {fiyat, ilk_gorulme}); `simdi` verilmezse B-14 uygulanmaz.
    """
    onceki = onceki or {}
    kanal_kayitlari = {g["anahtar"]: g for g in gonderimler if g.get("kanal") == kanal}
    sonuc = []
    for f in firsatlar:
        kayit = kanal_kayitlari.get(f.anahtar)
        if kayit and kayit.get("durum") == "gonderildi":
            if _belirgin_dustu(kayit.get("fiyat"), f.fiyat):
                f.yeniden = True
                sonuc.append(f)
            continue
        if kayit:                                                # önceki deneme başarısız: yeniden dene, 3 gün sonra vazgeç
            denendi = _zaman(kayit.get("zaman"))
            if simdi is None or denendi is None or (simdi - denendi).total_seconds() <= 72 * 3600:
                sonuc.append(f)
            continue
        eski = onceki.get(f.anahtar)
        if eski is None or simdi is None:                        # bu turda ilk kez bulundu
            sonuc.append(f)
            continue
        bulundu = _zaman(eski.get("ilk_gorulme"))
        if bulundu is not None and (simdi - bulundu).total_seconds() <= 24 * 3600:
            sonuc.append(f)
        elif _belirgin_dustu(eski.get("fiyat"), f.fiyat):
            f.yeniden = True
            sonuc.append(f)
    return sonuc
