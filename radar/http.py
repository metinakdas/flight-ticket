"""Küçük HTTP yardımcısı (standart kitaplık). Testlerde `gonder` yerine sahte bir işlev verilir; testler ağa çıkmaz."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable

# gonder(yontem, url, basliklar, govde_bayt) -> (durum_kodu, yanit_metni)
Gonder = Callable[[str, str, dict, bytes | None], tuple[int, str]]
KULLANICI_ARACI = "flight-ticket/1.0"


def gonder(yontem: str, url: str, basliklar: dict, govde: bytes | None = None, sure: float = 30) -> tuple[int, str]:
    if not url.startswith("https://"):
        raise ValueError("yalnızca https adresleri kullanılır")
    istek = urllib.request.Request(url, data=govde, method=yontem, headers={"User-Agent": KULLANICI_ARACI, **basliklar})  # noqa: S310
    try:
        with urllib.request.urlopen(istek, timeout=sure) as yanit:  # noqa: S310  # nosec B310 - yalnızca https
            return yanit.status, yanit.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as hata:
        return hata.code, hata.read().decode("utf-8", "replace")


def json_gonder(gonderici: Gonder, yontem: str, url: str, basliklar: dict, veri=None) -> tuple[int, object]:
    govde = json.dumps(veri, ensure_ascii=False).encode("utf-8") if veri is not None else None
    if govde is not None:
        basliklar = {"Content-Type": "application/json", **basliklar}
    kod, metin = gonderici(yontem, url, basliklar, govde)
    try:
        return kod, json.loads(metin) if metin else {}
    except ValueError:
        return kod, {}
