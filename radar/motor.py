"""Radar turu (MIMARI.md 5.3). Adımlar: ön denetim → takipleri al → süresi dolanları kapat → sorgu planı →
fiyatları topla → süz → değerlendir → bildir → sonuçları kasaya yaz.

Günlük kuralı (G-3): herkese açık depoda Actions günlükleri de herkese açıktır. Bu modül ekrana yalnızca sayıları
ve takibin kısa kimliğini yazar; rota, tarih, fiyat, bütçe ya da alıcı yazmaz. Ayrıntılı döküm yalnızca
`--deneme` kipinde ve GitHub Actions dışında verilir.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone

from . import messages
from .config import TUR_BUTCESI, Ayarlar
from .guvenlik import redact
from .kasa import Kasa, KasaHatasi
from .kaynaklar import FiyatKaynagi, Gozlem, KaynakHatasi
from .kurallar import bildirilecekler, firsatlari_bul, suz
from .notify import BildirimHatasi, telegram_gonder
from .plan import planla

EN_FAZLA_GOZLEM = 2000


def _gozlem_kaydi(g: Gozlem) -> dict:
    return {"kalkis": g.kalkis, "varis": g.varis, "gidis": g.gidis, "donus": g.donus, "fiyat": g.fiyat, "havayolu": g.havayolu,
            "ucus_no": g.ucus_no, "aktarma": g.aktarma, "bagaj": {True: "dahil", False: "yok"}.get(g.bagaj), "kaynak": g.kaynak,
            "gorulme": g.gorulme.isoformat(timespec="seconds").replace("+00:00", "Z") if g.gorulme else None,
            "baglanti": g.baglanti, "belirsiz": g.belirsiz}


def tur(ayar: Ayarlar, *, kaynak: FiyatKaynagi, kasa: Kasa, deneme: bool = False, tetik: str = "elle",
        telegram=telegram_gonder, simdi: datetime | None = None, butce: int = TUR_BUTCESI, out=print) -> int:
    """Bir radar turu çalıştırır. Dönüş: 0 tamam/kısmi, 1 hata, 2 ön denetim başarısız."""
    basla = time.monotonic()
    simdi = simdi or datetime.now(timezone.utc)
    actions = os.environ.get("GITHUB_ACTIONS") == "true"
    ayrinti = deneme and not actions

    # 1. Ön denetim: kanal ya da kasa tanımlı değilse tur çalışmaz (bildirimler kaybolmasın)
    eksik = [ad for ad, tamam in (("bildirim kanalı", bool(ayar.kanallar)), ("kasa bağlantısı", ayar.kasa_hazir),
                                  ("fiyat kaynağı anahtarı", bool(ayar.tp_token))) if not tamam]
    if eksik:
        mesaj = "Tur çalışmadı; tanımlı değil: " + ", ".join(eksik)
        out(("::warning::" if actions else "⚠ ") + mesaj)
        return 2

    # 2. Takipleri al; kasaya ulaşılamazsa eski kopyayla çalışılmaz
    try:
        veri = kasa.takipler()
    except KasaHatasi as hata:
        out(f"✗ tur hata: {redact(str(hata))}")
        return 1
    bugun = veri.get("bugun") or simdi.date().isoformat()
    takipler = veri.get("takipler", [])
    gonderimler = veri.get("gonderimler", [])
    bildirim_sayilari = veri.get("bildirimSayilari", {})
    ulkeler = {kod: kayit["ulke"] for kod, kayit in messages.sabitler()[0].items()}

    sonuc: dict = {"kanallar": ayar.kanallar, "gozlemler": [], "tabanlar": [], "firsatlar": [], "gonderimler": [], "taramalar": [],
                   "suresiDolanlar": [], "kaynaklar": []}
    bildirim_hata = 0

    def gonder(metin: str) -> bool:
        nonlocal bildirim_hata
        if deneme:
            return True
        try:
            telegram(ayar.telegram_token, ayar.telegram_chat, metin)
            return True
        except BildirimHatasi as hata:
            bildirim_hata += 1
            out(f"✗ bildirim hata (telegram): {redact(str(hata), [ayar.telegram_token, ayar.telegram_chat])}")
            return False

    # 3. Süresi dolanları kapat (T-6): bir kez bilgi mesajı gider
    etkin = []
    for t in takipler:
        pencere = t.get("pencere")
        if t.get("tur") != "kampanya" and pencere and pencere["bit"] < bugun:
            if gonder(messages.takip_bitti_mesaji(t)):
                sonuc["suresiDolanlar"].append(t["kimlik"])
            out(f"takip {t['kimlik']}: süresi doldu")
        else:
            etkin.append(t)

    # 4. Sorgu planı
    plan, ertelenen = planla(etkin, butce)

    # 5. Fiyatları topla
    havuz: dict[str, list[Gozlem]] = {t["kimlik"]: [] for t in etkin}
    hepsi: dict[tuple, Gozlem] = {}
    sorgu_hata = 0
    kaynak_durum = "tamam"
    yapilan = 0
    for sorgu, sahipler in plan.items():
        yapilan += 1
        try:
            gelen = kaynak.gozlemler(sorgu)
        except KaynakHatasi as hata:
            sorgu_hata += 1
            kaynak_durum = "hata"
            out(f"✗ kaynak hata ({kaynak.ad}): kod {hata.kod}")
            if hata.kod == 429:          # V-4: o turda durulur
                break
            continue
        for g in gelen:
            hepsi.setdefault((g.anahtar, g.havayolu, g.fiyat), g)
            for kimlik in sahipler:
                havuz[kimlik].append(g)
    sonuc["kaynaklar"].append({"kaynak": kaynak.ad, "durum": kaynak_durum})

    # 6. Kaydedilecek gözlemler ve günlük tabanlar (A-3)
    kayitlar = [g for g in hepsi.values() if not g.belirsiz][:EN_FAZLA_GOZLEM]
    sonuc["gozlemler"] = [_gozlem_kaydi(g) for g in kayitlar]
    taban: dict[tuple, float] = {}
    for g in kayitlar:
        if not g.donus:
            k = (g.kalkis, g.varis, g.gidis)
            taban[k] = min(taban.get(k, g.fiyat), g.fiyat)
    sonuc["tabanlar"] = [{"kalkis": k[0], "varis": k[1], "ucus_ayi": k[2][:7], "gun": bugun, "en_dusuk": v} for k, v in taban.items()]

    # 7–8. Değerlendir ve bildir: takip başına tek mesaj (B-3)
    taranan = {kimlik for sahipler in list(plan.values())[:yapilan] for kimlik in sahipler}
    firsat_sayisi = 0
    for t in etkin:
        if t["kimlik"] not in taranan:
            continue
        uygun = suz(t, havuz[t["kimlik"]], simdi, ulkeler)
        firsatlar = firsatlari_bul(t, uygun)
        firsat_sayisi += len(firsatlar)
        sonuc["taramalar"].append({"takip": t["kimlik"], "son_fiyat": min((g.fiyat for g in uygun), default=None)})
        for f in firsatlar:
            sonuc["firsatlar"].append({"takip": f.takip, "anahtar": f.anahtar, "fiyat": f.fiyat, "tetikler": f.tetikler,
                                       "ayrinti": _gozlem_kaydi(f.gozlem)})
        out(f"takip {t['kimlik']}: {len(havuz[t['kimlik']])} gözlem, {len(uygun)} uygun, {len(firsatlar)} fırsat")
        if ayrinti:
            for f in firsatlar[:10]:
                g = f.gozlem
                out(f"    {g.kalkis}→{g.varis} {g.gidis} {messages.tl(g.fiyat)} {g.havayolu or ''}")
        for kanal in [k for k in t.get("kanallar", []) if k in ayar.kanallar]:
            yeni = bildirilecekler(firsatlar, gonderimler, kanal)
            if not yeni:
                continue
            if bildirim_sayilari.get(t["kimlik"], 0) >= (t.get("gunlukSinir") or 10):   # B-4
                out(f"takip {t['kimlik']}: günlük bildirim sınırı doldu, {len(yeni)} fırsat bekletildi")
                continue
            metin = messages.firsat_mesaji(t, yeni, simdi, ayar.kasa_url or None)
            if ayrinti:
                out("    --- gönderilecek mesaj ---\n" + "\n".join("    " + s for s in metin.splitlines()))
            tamam = gonder(metin)
            if not deneme:                                       # B-7: gönderim kanal bazında kaydedilir
                for f in yeni:
                    sonuc["gonderimler"].append({"anahtar": f.anahtar, "kanal": kanal, "durum": "gonderildi" if tamam else "hata", "fiyat": f.fiyat})
            if tamam:
                bildirim_sayilari[t["kimlik"]] = bildirim_sayilari.get(t["kimlik"], 0) + 1

    # 9. Sonuçları kasaya yaz (tek istek)
    durum = "kismi" if (sorgu_hata or bildirim_hata or ertelenen) else "tamam"
    sure = round(time.monotonic() - basla, 1)
    sonuc["tur"] = {"durum": durum, "tetik": tetik, "sure_sn": sure, "takip": len(etkin), "sorgu": yapilan, "sorgu_hata": sorgu_hata,
                    "gozlem": len(kayitlar), "firsat": firsat_sayisi, "bildirim_hata": bildirim_hata, "butce_kalan": max(0, butce - yapilan)}
    out(f"tur {durum}: {len(etkin)} takip, {yapilan} sorgu ({sorgu_hata} hata), {len(kayitlar)} gözlem, {firsat_sayisi} fırsat, "
        f"{len(sonuc['gonderimler'])} gönderim kaydı, {len(ertelenen)} takip ertelendi, {sure} sn")
    if deneme:
        out("Deneme kipi: bildirim gönderilmedi, kasaya yazılmadı.")
        return 0
    try:
        kasa.sonuc_yaz(sonuc)
    except KasaHatasi as hata:
        out(f"✗ sonuçlar kasaya yazılamadı: {redact(str(hata))}")
        return 1
    return 0
