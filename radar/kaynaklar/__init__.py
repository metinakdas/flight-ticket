"""Fiyat kaynakları tek bir arayüzün arkasındadır (V-1): "şu sorgu için gözlemleri ver".

Kaynak değiştirmek ya da ikincisini eklemek motorun geri kalanına dokunmaz.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class Sorgu:
    """Kaynağa sorulan tek soru. Aynı sorguyu isteyen takipler tek sorguyu paylaşır (P-2)."""
    kalkis: str                      # havalimanı kodu (H-1)
    varis_tur: str                   # "havalimani" | "ulke" | "her-yer"
    varis: str | None                # havalimanı ya da ülke kodu; "her-yer" için None
    bas: str                         # gidiş penceresi başlangıcı (YYYY-AA-GG)
    bit: str
    yon: str = "tek"                 # "tek" | "gidis-donus"
    donus_bas: str | None = None
    donus_bit: str | None = None
    kalis_az: int | None = None
    kalis_cok: int | None = None


@dataclass
class Gozlem:
    """Bir kaynaktan okunan tek fiyat kaydı (V-2). Fiyat TL, kişi başı, toplamdır (F-1)."""
    kalkis: str                      # gerçek kalkış havalimanı (H-3)
    varis: str                       # gerçek varış havalimanı
    gidis: str                       # kalkış havalimanının yerel tarihi (T-1)
    fiyat: float
    kaynak: str
    okunma: datetime
    gidis_saat: str | None = None    # "SS:DD"; kaynak vermezse None (T-7)
    donus: str | None = None
    havayolu: str | None = None
    ucus_no: str | None = None
    aktarma: int | None = None
    bagaj: bool | None = None        # None: bilinmiyor (F-7)
    gorulme: datetime | None = None  # kaynağın fiyatı gördüğü an (F-5)
    baglanti: str | None = None
    belirsiz: bool = False           # havalimanı belirsiz (H-4): saklanır ama bildirim tetiklemez
    ek: dict = field(default_factory=dict)

    @property
    def anahtar(self) -> str:
        return "|".join([self.kalkis, self.varis, self.gidis] + ([self.donus] if self.donus else []))


class KaynakHatasi(Exception):
    def __init__(self, mesaj: str, kod: int = 0):
        super().__init__(mesaj)
        self.kod = kod


class FiyatKaynagi(Protocol):
    ad: str

    def gozlemler(self, sorgu: Sorgu) -> list[Gozlem]:
        """Sorguya uyan gözlemler. Hata durumunda KaynakHatasi fırlatır; 429 için kod=429."""
        ...
