"""Sorgu planı ve bütçe (MIMARI.md 7.9).

Her takip sorgulara açılır, aynı sorgular birleştirilir, öncelik sırasına konur ve tur bütçesine sığanlar seçilir.
"""

from __future__ import annotations

from .config import TUR_BUTCESI
from .kaynaklar import Sorgu


def takip_sorgulari(takip: dict) -> list[Sorgu]:
    """Bir takibin kaynak sorguları. Kampanya takipleri ve penceresi kalmamış takipler sorgu üretmez."""
    pencere = takip.get("pencere")
    if takip.get("tur") == "kampanya" or not pencere or pencere["bit"] < pencere["bas"]:
        return []
    varis = takip.get("varis") or {}
    kapsam = varis.get("kapsam")
    if kapsam == "havalimani":
        hedefler = [("havalimani", kod) for kod in varis.get("havalimanlari", [])]
    elif kapsam == "ulke":
        hedefler = [("ulke", kod) for kod in varis.get("ulkeler", [])]
    elif kapsam == "yurt-ici":
        hedefler = [("ulke", "TR")]
    else:  # yurt dışı ve her yer: tek geniş sorgu; ülke süzgeci sonradan uygulanır (H-5)
        hedefler = [("her-yer", None)]
    donus = {}
    yon = "gidis-donus" if takip.get("yon") == "gidis-donus" else "tek"
    d = takip.get("donus") or {}
    if yon == "gidis-donus":
        if d.get("bicim") == "aralik":
            donus = {"donus_bas": d.get("baslangic"), "donus_bit": d.get("bitis")}
        else:
            donus = {"kalis_az": d.get("enAz"), "kalis_cok": d.get("enCok")}
    return [Sorgu(kalkis=k, varis_tur=tur, varis=kod, bas=pencere["bas"], bit=pencere["bit"], yon=yon, **donus)
            for k in takip.get("kalkis", []) for tur, kod in hedefler]


def planla(takipler: list[dict], butce: int = TUR_BUTCESI) -> tuple[dict[Sorgu, list[str]], list[str]]:
    """(sorgu → onu isteyen takip kimlikleri, bu tura sığmayan takip kimlikleri) döndürür.

    P-2: aynı sorguyu isteyen takipler tek sorguyu paylaşır.
    P-4: en uzun süredir taranmayan takip önce; eşitlikte gidiş tarihi yakın olan.
    P-5: bütçe yetmezse kalan takipler sonraki tura kalır.
    P-7: bir takip tek başına bütçenin yarısından fazlasını kullanamaz.
    """
    sirali = sorted(takipler, key=lambda t: (t.get("sonTarama") or "", (t.get("pencere") or {}).get("bas") or "9999"))
    plan: dict[Sorgu, list[str]] = {}
    ertelenen: list[str] = []
    for takip in sirali:
        sorgular = takip_sorgulari(takip)[: max(1, butce // 2)]
        if not sorgular:
            continue
        yeni = [s for s in dict.fromkeys(sorgular) if s not in plan]
        if len(plan) + len(yeni) > butce:
            ertelenen.append(takip["kimlik"])
            continue
        for s in sorgular:
            sahipler = plan.setdefault(s, [])
            if takip["kimlik"] not in sahipler:
                sahipler.append(takip["kimlik"])
    return plan, ertelenen
