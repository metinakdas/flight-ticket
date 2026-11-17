"""Bildirim metinleri (MIMARI.md 7.7). Telegram için HTML biçimi; kullanıcıdan ve kaynaktan gelen her metin kaçışlanır."""

from __future__ import annotations

import json
from datetime import date, datetime
from functools import lru_cache
from html import escape

from .config import MESAJDA_SECENEK, ROOT
from .guvenlik import safe_url
from .kurallar import Firsat, yas_saat

AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
GUNLER = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
HAVAYOLU_SITESI = {"PC": "https://www.flypgs.com/", "VF": "https://ajet.com/", "TK": "https://www.turkishairlines.com/",
                   "XQ": "https://www.sunexpress.com/"}
TELEGRAM_SINIRI = 4000


@lru_cache(maxsize=1)
def sabitler() -> tuple[dict, dict]:
    """(havalimanı kodu → kayıt, havayolu kodu → ad)"""
    oku = lambda ad: json.loads((ROOT / "radar" / "veri" / ad).read_text(encoding="utf-8"))
    return ({x["kod"]: x for x in oku("havalimanlari.json")}, {x["kod"]: x["ad"] for x in oku("havayollari.json")})


def tl(tutar: float) -> str:
    return f"{round(tutar):,}".replace(",", ".") + " TL"


def tarih_yaz(gun: str, kisa: bool = False) -> str:
    d = date.fromisoformat(gun)
    return f"{d.day} {AYLAR[d.month - 1][:3]}" if kisa else f"{d.day} {AYLAR[d.month - 1]} {GUNLER[d.weekday()]}"


def yas_yaz(saat: float | None) -> str:
    if saat is None:
        return "ne zaman görüldüğü bilinmiyor"
    if saat < 1:
        return "1 saatten kısa süre önce görüldü"
    if saat < 48:
        return f"{round(saat)} saat önce görüldü"
    return f"{round(saat / 24)} gün önce görüldü"


def havalimani_adi(kod: str) -> str:
    kayit = sabitler()[0].get(kod)
    return kayit["ad"] if kayit else kod


def _baglanti(url: str | None, yazi: str) -> str | None:
    url = safe_url(url)
    if not url or not url.startswith("https://"):    # B-10: yalnızca https
        return None
    return f'<a href="{escape(url, quote=True)}">{escape(yazi)}</a>'


def _ucus(f: Firsat) -> str:
    g = f.gozlem
    havayolu = sabitler()[1].get(g.havayolu, g.havayolu) if g.havayolu else None
    parcalar = [tarih_yaz(g.gidis) + (f" {g.gidis_saat}" if g.gidis_saat else "")]
    if g.donus:
        parcalar[0] += f" – dönüş {tarih_yaz(g.donus)}"
    parcalar.append(tl(g.fiyat))
    if havayolu:
        parcalar.append(havayolu + (f" {g.havayolu} {g.ucus_no}" if g.ucus_no else ""))
    if g.aktarma is not None:
        parcalar.append("aktarmasız" if g.aktarma == 0 else f"{g.aktarma} aktarma")
    return " · ".join(parcalar)


def firsat_mesaji(takip: dict, firsatlar: list[Firsat], simdi: datetime, panel_url: str | None = None) -> str:
    """Bir takip için tek mesaj (B-3): en ucuz seçenek ayrıntılı, sonraki dördü kısa, kalanı sayı olarak."""
    ilk, diger = firsatlar[0], firsatlar[1:MESAJDA_SECENEK]
    g = ilk.gozlem
    baslik = "[FİYAT DÜŞTÜ]" if ilk.yeniden else "[UCUZ BİLET]"
    satirlar = [f"<b>{baslik} {escape(havalimani_adi(g.kalkis))} → {escape(havalimani_adi(g.varis))}</b>", escape(_ucus(ilk))]
    yolcu = takip.get("yolcu") or 1
    if yolcu > 1:                                                # F-3
        satirlar.append(f"Kişi başı {tl(g.fiyat)} · {yolcu} yolcu toplam {tl(g.fiyat * yolcu)}")
    esik = (takip.get("tetikler") or {}).get("esik") or {}
    if "esik" in ilk.tetikler and esik.get("tutar"):
        satirlar.append(f"Eşik: {tl(esik['tutar'])}")
    satirlar.append(f"Fiyat {yas_yaz(yas_saat(g, simdi))}; satın almadan önce havayolu sitesinde doğrulayın.")   # F-6, V-7
    if saat := takip.get("saat"):
        if not g.gidis_saat:                                     # T-7
            satirlar.append("Saat bilgisi yok; kalkış saati süzgeci uygulanamadı.")
    satirlar.append({True: "Bagaj dahil.", False: "Bagaj dahil değil."}.get(g.bagaj, "Bagaj dahil olmayabilir."))   # F-7
    if diger:
        satirlar.append("")
        satirlar.append("Diğer seçenekler:")
        for f in diger:
            o = f.gozlem
            rota = "" if (o.kalkis, o.varis) == (g.kalkis, g.varis) else f"{o.kalkis} → {o.varis} · "
            havayolu = sabitler()[1].get(o.havayolu, o.havayolu or "")
            satirlar.append(escape(f"• {rota}{tarih_yaz(o.gidis, kisa=True)} · {tl(o.fiyat)}" + (f" · {havayolu}" if havayolu else "")))
    kalan = len(firsatlar) - 1 - len(diger)
    if kalan > 0:
        satirlar.append(f"+{kalan} seçenek daha, panelde")
    baglantilar = [b for b in (
        _baglanti(g.baglanti, "Satın al (aviasales.com)"),
        _baglanti(HAVAYOLU_SITESI.get(g.havayolu or ""), f"{sabitler()[1].get(g.havayolu, 'Havayolu')} sitesi"),
        _baglanti(panel_url, "Panel"),
    ) if b]
    if baglantilar:
        satirlar.append("")
        satirlar.append(" · ".join(baglantilar))
    satirlar.append(f"<i>{escape(takip.get('ad') or '')}</i>")
    return "\n".join(satirlar)[:TELEGRAM_SINIRI]


def takip_bitti_mesaji(takip: dict) -> str:
    return f"<b>[TAKİP BİTTİ]</b> {escape(takip.get('ad') or '')}\nTarih penceresi geçti; takip kapatıldı."


def deneme_mesaji() -> str:
    return "<b>Flight Ticket</b>\nDeneme mesajı: bildirim kanalı çalışıyor."
