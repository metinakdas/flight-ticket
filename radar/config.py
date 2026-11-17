"""Proje yolları ve ortamdan okunan ayarlar. Ayarların değerleri hiçbir zaman ekrana ya da günlüğe yazılmaz."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TUR_BUTCESI = 60          # P-1: tur başına en fazla sorgu
TAZELIK_SAAT = 72         # F-5
YENIDEN_BILDIRIM_YUZDE = 5   # B-2
YENIDEN_BILDIRIM_TL = 50     # B-2
MESAJDA_SECENEK = 5       # B-3


def env_yukle(yol: Path | None = None) -> None:
    """.env dosyasındaki satırları ortama ekler; ortamda zaten olan değerin üzerine yazmaz."""
    yol = yol or ROOT / ".env"
    if not yol.exists():
        return
    for ham in yol.read_text(encoding="utf-8-sig").splitlines():
        satir = ham.strip()
        if not satir or satir.startswith("#") or "=" not in satir:
            continue
        ad, deger = satir.split("=", 1)
        os.environ.setdefault(ad.strip(), deger.strip().strip('"').strip("'"))


@dataclass
class Ayarlar:
    tp_token: str = ""
    tp_marker: str = ""
    kasa_url: str = ""
    kasa_token: str = ""
    telegram_token: str = ""
    telegram_chat: str = ""
    telegram_teknik: str = ""

    @property
    def kanallar(self) -> list[str]:
        """Kurulu bildirim kanalları (yalnızca adlar)."""
        kurulu = []
        if self.telegram_token and self.telegram_chat:
            kurulu.append("telegram")
        return kurulu

    @property
    def kasa_hazir(self) -> bool:
        return self.kasa_url.startswith("https://") and len(self.kasa_token) >= 32


def ayarlari_oku() -> Ayarlar:
    e = os.environ.get
    return Ayarlar(
        tp_token=e("TRAVELPAYOUTS_TOKEN", ""), tp_marker=e("TRAVELPAYOUTS_MARKER", ""),
        kasa_url=e("KASA_URL", "").rstrip("/"), kasa_token=e("RADAR_API_TOKEN", ""),
        telegram_token=e("TELEGRAM_BOT_TOKEN", ""), telegram_chat=e("TELEGRAM_CHAT_ID", ""),
        telegram_teknik=e("TELEGRAM_TECH_CHAT_ID", ""),
    )
