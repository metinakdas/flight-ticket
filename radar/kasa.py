"""Kasa istemcisi: radarın kullandığı iki uç (etkin takipleri oku, tur sonuçlarını yaz)."""

from __future__ import annotations

from . import http
from .guvenlik import redact


class KasaHatasi(Exception):
    pass


class Kasa:
    def __init__(self, url: str, anahtar: str, gonder: http.Gonder = http.gonder):
        self.url = url.rstrip("/")
        self.basliklar = {"Authorization": "Bearer " + anahtar}
        self.gonder = gonder

    def _cagir(self, yontem: str, yol: str, veri=None) -> dict:
        try:
            kod, yanit = http.json_gonder(self.gonder, yontem, self.url + yol, dict(self.basliklar), veri)
        except Exception as hata:  # ağ hatası: ayrıntıda adres ya da anahtar geçebilir, maskelenir
            raise KasaHatasi(redact(f"kasaya ulaşılamadı: {type(hata).__name__}")) from None
        if kod != 200 or not isinstance(yanit, dict):
            raise KasaHatasi(f"kasa {yol} için {kod} döndü")
        return yanit

    def takipler(self) -> dict:
        """{bugun, ayarlar, takipler, gonderimler, bildirimSayilari}"""
        return self._cagir("GET", "/api/ic/takipler")

    def sonuc_yaz(self, sonuc: dict) -> dict:
        return self._cagir("POST", "/api/ic/sonuc", sonuc)
