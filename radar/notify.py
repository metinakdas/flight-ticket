"""Bildirim kanalları. Şimdilik Telegram; e-posta ve WhatsApp sonraki adımda eklenir.

Hata metinlerinde bot anahtarı ve sohbet kimliği hiçbir zaman geçmez: adres hata metnine konmaz, kalan metin maskelenir.
"""

from __future__ import annotations

from . import http
from .guvenlik import redact

TELEGRAM = "https://api.telegram.org"


class BildirimHatasi(Exception):
    pass


def telegram_gonder(anahtar: str, sohbet: str, metin: str, gonder: http.Gonder = http.gonder) -> None:
    """Telegram'a HTML biçimli mesaj gönderir. Bağlantı önizlemesi kapalıdır."""
    veri = {"chat_id": sohbet, "text": metin, "parse_mode": "HTML", "disable_web_page_preview": True}
    try:
        kod, yanit = http.json_gonder(gonder, "POST", f"{TELEGRAM}/bot{anahtar}/sendMessage", {}, veri)
    except Exception as hata:
        raise BildirimHatasi(f"Telegram'a ulaşılamadı: {type(hata).__name__}") from None
    if kod != 200 or not (isinstance(yanit, dict) and yanit.get("ok")):
        aciklama = yanit.get("description", "") if isinstance(yanit, dict) else ""
        raise BildirimHatasi(redact(f"Telegram {kod} döndü: {aciklama}", [anahtar, sohbet])[:200])
