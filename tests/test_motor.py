"""Radar motoru: kaynak, sorgu planı, süzgeçler, tetikler, mesajlar ve uçtan uca tur.

Testler ağa çıkmaz; kaynak, kasa ve Telegram sahte nesnelerle taklit edilir. Saat sabittir.
Test adlarında MIMARI.md'deki kural kimlikleri geçer.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from radar import messages, motor
from radar.config import Ayarlar
from radar.kasa import Kasa, KasaHatasi
from radar.kaynaklar import Gozlem, KaynakHatasi, Sorgu
from radar.kaynaklar import travelpayouts as tp
from radar.kurallar import Firsat, bildirilecekler, firsatlari_bul, suz
from radar.notify import BildirimHatasi, telegram_gonder
from radar.plan import planla, takip_sorgulari

SIMDI = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)
BUGUN = "2026-11-17"
ULKELER = {kod: kayit["ulke"] for kod, kayit in messages.sabitler()[0].items()}
SAHTE_BOT = "123456789:" + "AAH" + "y" * 32
SAHTE_SOHBET = "-1009876543210"


def takip(kimlik="aaaaaaaa", **ek) -> dict:
    t = {"kimlik": kimlik, "ad": "Erzurum bileti", "tur": "rota", "kalkis": ["SAW"],
         "varis": {"kapsam": "havalimani", "havalimanlari": ["ERZ"], "ulkeler": []}, "yon": "tek",
         "tarih": {"bicim": "surekli", "pencere": 90, "gunler": [], "aylar": []}, "donus": None, "yolcu": 1, "aktarma": "farketmez",
         "havayolu": {"kip": "hepsi", "kodlar": []}, "saat": None, "tetikler": {"esik": {"acik": True, "tutar": 1500}},
         "kanallar": ["telegram"], "gunlukSinir": 10, "sonTarama": None, "pencere": {"bas": BUGUN, "bit": "2027-02-14"}}
    t.update(ek)
    return t


def gozlem(fiyat=1249.0, kalkis="SAW", varis="ERZ", gidis="2026-12-07", saat_once=3.0, **ek) -> Gozlem:
    g = Gozlem(kalkis=kalkis, varis=varis, gidis=gidis, fiyat=fiyat, kaynak="travelpayouts", okunma=SIMDI, gidis_saat="17:55",
               havayolu="PC", ucus_no="2554", aktarma=0, bagaj=False, gorulme=SIMDI - timedelta(hours=saat_once),
               baglanti="https://www.aviasales.com/search/x")
    for k, v in ek.items():
        setattr(g, k, v)
    return g


# ------------------------------------------------------------------ kaynak (Travelpayouts)

def test_H3_sorgu_her_zaman_havalimani_turuyle_ve_TL_ile_sorulur():
    metin = tp.sorgu_metni(Sorgu("IST", "havalimani", "ADB", "2026-12-01", "2027-02-01"))
    assert 'origin:"IST"' in metin and "origin_type:AIRPORT" in metin and "destination_type:AIRPORT" in metin
    assert 'currency:"try"' in metin and "prices_one_way" in metin and "grouping:DEPART_DATE" in metin
    genis = tp.sorgu_metni(Sorgu("SAW", "ulke", "TR", "2026-12-01", "2027-02-01"))
    assert "destination_type:COUNTRY" in genis and "grouping:DIRECTIONS" in genis
    gd = tp.sorgu_metni(Sorgu("SAW", "havalimani", "AYT", "2027-05-10", "2027-05-15", yon="gidis-donus", kalis_az=3, kalis_cok=7))
    assert "prices_round_trip" in gd and "trip_duration_min:3" in gd and "trip_duration_max:7" in gd


def test_V6_sorgu_degerleri_yalnizca_harf_rakam_tire_olabilir():
    with pytest.raises(ValueError):
        tp.sorgu_metni(Sorgu('IST"}){evil', "havalimani", "ADB", "2026-12-01", "2027-02-01"))


KAYIT = {"departure_at": "2026-12-07T17:55:00+03:00", "return_at": None, "origin_airport_iata": "SAW", "destination_airport_iata": "ERZ",
         "value": 1249.5, "currency": "try", "main_airline": "PC", "number_of_changes": 0, "found_at": int(SIMDI.timestamp()) - 3600,
         "with_baggage": False, "ticket_link": "/search/SAW0712ERZ1?x=1", "segments": [{"flight_legs": [{"flight_number": "2554"}]}]}


def test_V2_kayit_gozleme_cevrilir():
    g = tp.kayittan_gozlem(KAYIT, SIMDI)
    assert (g.kalkis, g.varis, g.gidis, g.gidis_saat, g.fiyat, g.havayolu, g.ucus_no, g.aktarma, g.bagaj) == \
        ("SAW", "ERZ", "2026-12-07", "17:55", 1249.5, "PC", "2554", 0, False)
    assert g.gorulme == SIMDI - timedelta(hours=1) and g.baglanti == "https://www.aviasales.com/search/SAW0712ERZ1?x=1"
    assert not g.belirsiz and g.donus is None and g.anahtar == "SAW|ERZ|2026-12-07"


def test_H4_havalimani_alani_bos_gelirse_gozlem_belirsiz_isaretlenir_ve_eksik_alan_tahmin_edilmez():
    assert tp.kayittan_gozlem({**KAYIT, "origin_airport_iata": None}, SIMDI).belirsiz
    assert tp.kayittan_gozlem({**KAYIT, "value": None}, SIMDI) is None
    assert tp.kayittan_gozlem({**KAYIT, "found_at": None}, SIMDI).gorulme is None
    assert tp.kayittan_gozlem({**KAYIT, "ticket_link": "javascript:alert(1)"}, SIMDI).baglanti is None


def _kaynak(yanitlar, bekleme=None):
    istekler = []

    def gonder(yontem, url, basliklar, govde):
        istekler.append((url, basliklar, json.loads(govde)))
        return yanitlar[min(len(istekler), len(yanitlar)) - 1]

    return tp.Travelpayouts("gizli-kaynak-anahtari", gonder=gonder, bekle=(bekleme.append if bekleme is not None else lambda s: None),
                            saat=lambda: 0.0), istekler


def test_V3_V4_kaynak_TL_vermezse_ya_da_429_donerse_hata_firlatir_anahtar_adreste_gecmez():
    s = Sorgu("SAW", "havalimani", "ERZ", "2026-12-01", "2027-02-01")
    tamam = (200, json.dumps({"data": {"prices_one_way": [KAYIT]}}))
    kaynak, istekler = _kaynak([tamam])
    assert len(kaynak.gozlemler(s)) == 1
    url, basliklar, _ = istekler[0]
    assert "gizli-kaynak-anahtari" not in url and basliklar["X-Access-Token"] == "gizli-kaynak-anahtari"
    with pytest.raises(KaynakHatasi) as h:
        _kaynak([(429, "")])[0].gozlemler(s)
    assert h.value.kod == 429
    with pytest.raises(KaynakHatasi, match="TL"):
        _kaynak([(200, json.dumps({"data": {"prices_one_way": [{**KAYIT, "currency": "usd"}]}}))])[0].gozlemler(s)
    with pytest.raises(KaynakHatasi):
        _kaynak([(200, json.dumps({"errors": [{"message": "x"}], "data": None}))])[0].gozlemler(s)
    assert _kaynak([(200, json.dumps({"data": {"prices_one_way": None}}))])[0].gozlemler(s) == []


def test_V5_istekler_arasinda_en_az_bir_saniye_beklenir():
    bekleme = []
    kaynak, _ = _kaynak([(200, json.dumps({"data": {"prices_one_way": []}}))], bekleme)
    s = Sorgu("SAW", "havalimani", "ERZ", "2026-12-01", "2027-02-01")
    kaynak.gozlemler(s)
    kaynak.gozlemler(s)
    kaynak.gozlemler(s)
    assert len(bekleme) == 2 and all(b >= 1.0 for b in bekleme)


# ------------------------------------------------------------------ sorgu planı

def test_takip_sorgulara_acilir():
    assert takip_sorgulari(takip()) == [Sorgu("SAW", "havalimani", "ERZ", BUGUN, "2027-02-14")]
    cok = takip(kalkis=["IST", "SAW"], varis={"kapsam": "havalimani", "havalimanlari": ["ERZ", "TZX"]})
    assert len(takip_sorgulari(cok)) == 4
    assert [(s.varis_tur, s.varis) for s in takip_sorgulari(takip(tur="butce", varis={"kapsam": "yurt-ici"}))] == [("ulke", "TR")]
    assert [(s.varis_tur, s.varis) for s in takip_sorgulari(takip(tur="butce", varis={"kapsam": "her-yer"}))] == [("her-yer", None)]
    assert [s.varis for s in takip_sorgulari(takip(tur="butce", varis={"kapsam": "ulke", "ulkeler": ["DE", "NL"]}))] == ["DE", "NL"]
    assert takip_sorgulari(takip(tur="kampanya")) == []
    gd = takip_sorgulari(takip(tur="gidis-donus", yon="gidis-donus", donus={"bicim": "kalis", "enAz": 3, "enCok": 7}))[0]
    assert (gd.yon, gd.kalis_az, gd.kalis_cok) == ("gidis-donus", 3, 7)


def test_P2_ayni_sorguyu_isteyen_takipler_tek_sorguyu_paylasir():
    plan, ertelenen = planla([takip("aaaaaaaa"), takip("bbbbbbbb", tetikler={"esik": {"acik": True, "tutar": 900}})])
    assert len(plan) == 1 and next(iter(plan.values())) == ["aaaaaaaa", "bbbbbbbb"] and not ertelenen


def test_P4_en_uzun_suredir_taranmayan_takip_once_gelir():
    eski = takip("aaaaaaaa", sonTarama="2026-11-10T00:00:00Z", varis={"kapsam": "havalimani", "havalimanlari": ["TZX"]})
    yeni = takip("bbbbbbbb", sonTarama="2026-11-17T00:00:00Z", varis={"kapsam": "havalimani", "havalimanlari": ["VAN"]})
    hic = takip("cccccccc", sonTarama=None, varis={"kapsam": "havalimani", "havalimanlari": ["GZT"]})
    plan, _ = planla([yeni, eski, hic])
    assert [s.varis for s in plan] == ["GZT", "TZX", "VAN"]


def test_P5_P7_butce_yetmezse_takip_sonraki_tura_kalir_ve_tek_takip_butcenin_yarisini_asamaz():
    varislar = ["ERZ", "TZX", "GZT", "VAN"]
    a = takip("aaaaaaaa", kalkis=["IST", "SAW"], varis={"kapsam": "havalimani", "havalimanlari": varislar})          # 8 sorgu
    b = takip("bbbbbbbb", kalkis=["ESB", "ADB"], varis={"kapsam": "havalimani", "havalimanlari": varislar})          # 8 sorgu
    c = takip("cccccccc", kalkis=["AYT"], varis={"kapsam": "havalimani", "havalimanlari": ["KSY"]})                   # 1 sorgu
    plan, ertelenen = planla([a, b, c], butce=10)
    assert len(plan) == 10 and ertelenen == ["cccccccc"]      # a ve b en fazla yarısını (5'er) alır; c sonraki tura kalır
    assert sum(1 for sahipler in plan.values() if sahipler == ["aaaaaaaa"]) == 5


# ------------------------------------------------------------------ süzgeçler

def test_H3_gercek_kalkis_havalimani_listede_yoksa_gozlem_atilir():
    assert suz(takip(kalkis=["IST"]), [gozlem(kalkis="SAW")], SIMDI, ULKELER) == []
    assert len(suz(takip(kalkis=["IST", "SAW"]), [gozlem(kalkis="SAW")], SIMDI, ULKELER)) == 1


def test_H4_havalimani_belirsiz_gozlem_bildirim_tetiklemez():
    assert suz(takip(), [gozlem(belirsiz=True)], SIMDI, ULKELER) == []


def test_H5_varis_ulkesi_havalimani_listesinden_bulunur():
    yurt_ici = takip(tur="butce", varis={"kapsam": "yurt-ici"})
    yurt_disi = takip(tur="butce", varis={"kapsam": "yurt-disi"})
    ulke = takip(tur="butce", varis={"kapsam": "ulke", "ulkeler": ["DE"]})
    erz, ber, bilinmeyen = gozlem(varis="ERZ"), gozlem(varis="BER"), gozlem(varis="ZZZ")
    assert suz(yurt_ici, [erz, ber, bilinmeyen], SIMDI, ULKELER) == [erz]
    assert suz(yurt_disi, [erz, ber, bilinmeyen], SIMDI, ULKELER) == [ber]      # ülkesi bilinmeyen varış yurt dışı sayılmaz
    assert suz(ulke, [erz, ber, gozlem(varis="AMS")], SIMDI, ULKELER) == [ber]
    assert suz(takip(), [gozlem(varis="TZX")], SIMDI, ULKELER) == []


def test_T2_T3_T4_pencere_disi_ay_disi_ve_gun_disi_gozlem_atilir():
    assert suz(takip(), [gozlem(gidis="2027-03-01")], SIMDI, ULKELER) == []
    aylar = takip(tarih={"bicim": "aylar", "aylar": ["2026-12"], "gunler": []}, pencere={"bas": "2026-12-01", "bit": "2027-01-31"})
    assert len(suz(aylar, [gozlem(gidis="2026-12-07"), gozlem(gidis="2027-01-07")], SIMDI, ULKELER)) == 1
    cuma = takip(tarih={"bicim": "surekli", "pencere": 90, "gunler": [5], "aylar": []})
    assert [g.gidis for g in suz(cuma, [gozlem(gidis="2026-12-07"), gozlem(gidis="2026-12-11")], SIMDI, ULKELER)] == ["2026-12-11"]


def test_T5_gidis_donuste_kalis_suresi_ve_donus_araligi_uygulanir():
    kalis = takip(tur="gidis-donus", yon="gidis-donus", donus={"bicim": "kalis", "enAz": 3, "enCok": 7})
    assert len(suz(kalis, [gozlem(donus="2026-12-10"), gozlem(donus="2026-12-20"), gozlem(donus=None)], SIMDI, ULKELER)) == 1
    aralik = takip(tur="gidis-donus", yon="gidis-donus", donus={"bicim": "aralik", "baslangic": "2026-12-18", "bitis": "2026-12-22"})
    assert len(suz(aralik, [gozlem(donus="2026-12-19"), gozlem(donus="2026-12-25")], SIMDI, ULKELER)) == 1
    assert suz(takip(), [gozlem(donus="2026-12-10")], SIMDI, ULKELER) == []     # tek yön takibe gidiş-dönüş fiyatı girmez


def test_T7_saat_suzgeci_yalnizca_saat_bilgisi_varsa_uygulanir():
    sabah = takip(saat={"bas": "06:00", "bit": "12:00"})
    assert suz(sabah, [gozlem()], SIMDI, ULKELER) == []
    assert len(suz(sabah, [gozlem(gidis_saat="07:30")], SIMDI, ULKELER)) == 1
    assert len(suz(sabah, [gozlem(gidis_saat=None)], SIMDI, ULKELER)) == 1


def test_F5_72_saatten_eski_ya_da_gorulme_ani_bilinmeyen_fiyat_firsat_sayilmaz():
    assert len(suz(takip(), [gozlem(saat_once=71)], SIMDI, ULKELER)) == 1
    assert suz(takip(), [gozlem(saat_once=73)], SIMDI, ULKELER) == []
    assert suz(takip(), [gozlem(gorulme=None)], SIMDI, ULKELER) == []


def test_F9_F10_aktarma_ve_havayolu_suzgecleri():
    assert suz(takip(aktarma="aktarmasiz"), [gozlem(aktarma=1)], SIMDI, ULKELER) == []
    assert len(suz(takip(aktarma="en-fazla-1"), [gozlem(aktarma=1), gozlem(aktarma=2), gozlem(aktarma=None)], SIMDI, ULKELER)) == 1
    assert suz(takip(havayolu={"kip": "dahil", "kodlar": ["VF"]}), [gozlem()], SIMDI, ULKELER) == []
    assert suz(takip(havayolu={"kip": "haric", "kodlar": ["PC"]}), [gozlem()], SIMDI, ULKELER) == []
    assert len(suz(takip(havayolu={"kip": "dahil", "kodlar": ["PC"]}), [gozlem()], SIMDI, ULKELER)) == 1


# ------------------------------------------------------------------ tetikler ve yeniden bildirim

def test_F2_esik_tetigi_ve_ayni_firsatta_en_ucuz_gozlem():
    f = firsatlari_bul(takip(), [gozlem(1600), gozlem(1500), gozlem(1249), gozlem(1300, gidis="2026-12-08")])
    assert [(x.fiyat, x.gozlem.gidis) for x in f] == [(1249, "2026-12-07"), (1300, "2026-12-08")]
    assert f[0].anahtar == "aaaaaaaa|SAW|ERZ|2026-12-07" and f[0].tetikler == ["esik"]
    assert firsatlari_bul(takip(tetikler={"esik": {"acik": False, "tutar": 1500}}), [gozlem(1249)]) == []


def test_B1_B2_ayni_firsat_ikinci_kez_bildirilmez_ancak_yuzde_5_ve_50_TL_duserse():
    f = lambda fiyat: firsatlari_bul(takip(), [gozlem(fiyat)])
    kayit = lambda fiyat, kanal="telegram", durum="gonderildi": [{"anahtar": "aaaaaaaa|SAW|ERZ|2026-12-07", "kanal": kanal, "durum": durum, "fiyat": fiyat}]
    assert len(bildirilecekler(f(1249), [], "telegram")) == 1
    assert bildirilecekler(f(1249), kayit(1249), "telegram") == []
    assert bildirilecekler(f(1210), kayit(1249), "telegram") == []                   # 39 TL: yetmez
    assert bildirilecekler(firsatlari_bul(takip(), [gozlem(560)]), kayit(600), "telegram") == []   # %6,7 ama 40 TL: yetmez
    yeniden = bildirilecekler(f(1180), kayit(1249), "telegram")                      # 69 TL ve %5,5
    assert len(yeniden) == 1 and yeniden[0].yeniden


def test_B7_bir_kanala_gitmis_firsat_diger_kanal_icin_hala_beklemededir():
    f = firsatlari_bul(takip(), [gozlem(1249)])
    kayitlar = [{"anahtar": f[0].anahtar, "kanal": "telegram", "durum": "gonderildi", "fiyat": 1249},
                {"anahtar": f[0].anahtar, "kanal": "eposta", "durum": "hata", "fiyat": 1249}]
    assert bildirilecekler(f, kayitlar, "telegram") == []
    assert len(bildirilecekler(f, kayitlar, "eposta")) == 1


# ------------------------------------------------------------------ mesajlar

def test_B3_B9_mesajda_rota_tarih_fiyat_havayolu_aktarma_tetik_yas_ve_baglantilar_var():
    firsatlar = firsatlari_bul(takip(), [gozlem(1249)] + [gozlem(1300 + i, gidis=f"2026-12-{10 + i:02d}") for i in range(7)])
    metin = messages.firsat_mesaji(takip(), firsatlar, SIMDI, "https://kasa.ornek.dev")
    for parca in ["[UCUZ BİLET] Sabiha Gökçen → Erzurum", "7 Aralık Pazartesi 17:55", "1.249 TL", "Pegasus PC 2554", "aktarmasız", "Eşik: 1.500 TL",
                  "3 saat önce görüldü", "havayolu sitesinde doğrulayın", "Bagaj dahil değil.", "Diğer seçenekler:", "+3 seçenek daha, panelde",
                  'href="https://www.aviasales.com/search/x"', "Satın al (aviasales.com)", "Pegasus sitesi", 'href="https://kasa.ornek.dev"']:
        assert parca in metin, parca
    assert metin.count("•") == 4                                 # en ucuz 5 seçenek: 1 ayrıntılı + 4 kısa


def test_B10_F3_F7_T7_baglanti_yalnizca_https_yolcu_toplami_bagaj_ve_saat_notu():
    t = takip(yolcu=3, saat={"bas": "06:00", "bit": "12:00"}, ad="<b>Aile</b> & tatil")
    g = gozlem(1000, baglanti="http://ornek.com/x", bagaj=None, gidis_saat=None)
    metin = messages.firsat_mesaji(t, firsatlari_bul(t, [g]), SIMDI, "javascript:alert(1)")
    assert "ornek.com" not in metin and "javascript" not in metin
    assert "Kişi başı 1.000 TL · 3 yolcu toplam 3.000 TL" in metin
    assert "Bagaj dahil olmayabilir." in metin and "Saat bilgisi yok" in metin
    assert "&lt;b&gt;Aile&lt;/b&gt; &amp; tatil" in metin and "<b>Aile" not in metin    # kullanıcı metni kaçışlanır


def test_B2_yeniden_bildirimde_baslik_fiyat_dustu():
    f = firsatlari_bul(takip(), [gozlem(1100)])
    f[0].yeniden = True
    assert messages.firsat_mesaji(takip(), f, SIMDI).startswith("<b>[FİYAT DÜŞTÜ]")


def test_F6_fiyatin_yasi_yazilir():
    assert messages.yas_yaz(0.4) == "1 saatten kısa süre önce görüldü"
    assert messages.yas_yaz(30) == "30 saat önce görüldü"
    assert messages.yas_yaz(60) == "2 gün önce görüldü"
    assert "bilinmiyor" in messages.yas_yaz(None)


# ------------------------------------------------------------------ Telegram

def test_telegram_hata_metninde_bot_anahtari_ve_sohbet_kimligi_gecmez():
    def reddet(yontem, url, basliklar, govde):
        return 400, json.dumps({"ok": False, "description": f"chat {SAHTE_SOHBET} not found for bot{SAHTE_BOT}"})

    with pytest.raises(BildirimHatasi) as h:
        telegram_gonder(SAHTE_BOT, SAHTE_SOHBET, "x", gonder=reddet)
    assert SAHTE_BOT not in str(h.value) and SAHTE_SOHBET not in str(h.value)

    def patla(yontem, url, basliklar, govde):
        raise OSError(f"bağlanamadı: {url}")

    with pytest.raises(BildirimHatasi) as h:
        telegram_gonder(SAHTE_BOT, SAHTE_SOHBET, "x", gonder=patla)
    assert SAHTE_BOT not in str(h.value)

    gonderilen = {}

    def kabul(yontem, url, basliklar, govde):
        gonderilen.update(json.loads(govde), url=url)
        return 200, json.dumps({"ok": True})

    telegram_gonder(SAHTE_BOT, SAHTE_SOHBET, "<b>x</b>", gonder=kabul)
    assert gonderilen["chat_id"] == SAHTE_SOHBET and gonderilen["parse_mode"] == "HTML" and gonderilen["disable_web_page_preview"] is True


# ------------------------------------------------------------------ uçtan uca tur

class SahteKaynak:
    ad = "travelpayouts"

    def __init__(self, gozlemler=None, hata=None):
        self.liste = gozlemler if gozlemler is not None else [gozlem(1249), gozlem(1310, gidis="2026-12-12"), gozlem(1900, gidis="2026-12-13")]
        self.hata = hata
        self.sorgular = []

    def gozlemler(self, sorgu):
        self.sorgular.append(sorgu)
        if self.hata:
            raise self.hata
        return list(self.liste)


class SahteKasa:
    def __init__(self, takipler=None, gonderimler=None, sayilar=None, hata=False):
        self.veri = {"bugun": BUGUN, "ayarlar": {}, "takipler": takipler if takipler is not None else [takip()],
                     "gonderimler": gonderimler or [], "bildirimSayilari": sayilar or {}}
        self.hata = hata
        self.yazilan = []

    def takipler(self):
        if self.hata:
            raise KasaHatasi("kasaya ulaşılamadı")
        return json.loads(json.dumps(self.veri))

    def sonuc_yaz(self, sonuc):
        self.yazilan.append(sonuc)
        return {"tamam": True}


AYAR = Ayarlar(tp_token="k" * 32, kasa_url="https://kasa.ornek.dev", kasa_token="r" * 64, telegram_token=SAHTE_BOT, telegram_chat=SAHTE_SOHBET)


def calistir(kasa, kaynak=None, ayar=AYAR, telegram_hata=False, **ek):
    mesajlar, satirlar = [], []

    def telegram(anahtar, sohbet, metin):
        if telegram_hata:
            raise BildirimHatasi("Telegram 500 döndü")
        mesajlar.append(metin)

    kod = motor.tur(ayar, kaynak=kaynak or SahteKaynak(), kasa=kasa, telegram=telegram, simdi=SIMDI, out=satirlar.append, **ek)
    return kod, mesajlar, satirlar


def test_tur_firsati_bir_kez_bildirir_ve_sonuclari_kasaya_yazar():
    kasa = SahteKasa()
    kod, mesajlar, _ = calistir(kasa, tetik="zamanlayici")
    assert kod == 0 and len(mesajlar) == 1 and "[UCUZ BİLET]" in mesajlar[0] and "1.249 TL" in mesajlar[0]
    sonuc = kasa.yazilan[0]
    assert sonuc["tur"]["durum"] == "tamam" and sonuc["tur"]["tetik"] == "zamanlayici" and sonuc["tur"]["sorgu"] == 1 and sonuc["tur"]["firsat"] == 2
    assert sonuc["kanallar"] == ["telegram"] and len(sonuc["gozlemler"]) == 3 and len(sonuc["tabanlar"]) == 3
    assert {(g["anahtar"], g["kanal"], g["durum"], g["fiyat"]) for g in sonuc["gonderimler"]} == {
        ("aaaaaaaa|SAW|ERZ|2026-12-07", "telegram", "gonderildi", 1249.0), ("aaaaaaaa|SAW|ERZ|2026-12-12", "telegram", "gonderildi", 1310.0)}
    assert sonuc["taramalar"] == [{"takip": "aaaaaaaa", "son_fiyat": 1249.0}]

    # B-1: ikinci turda aynı fırsatlar yeniden bildirilmez
    kasa2 = SahteKasa(gonderimler=sonuc["gonderimler"])
    kod, mesajlar, _ = calistir(kasa2)
    assert kod == 0 and mesajlar == [] and kasa2.yazilan[0]["gonderimler"] == []


def test_B7_telegram_bozulursa_gonderim_hata_kaydedilir_ve_sonraki_turda_yeniden_denenir():
    kasa = SahteKasa()
    kod, mesajlar, satirlar = calistir(kasa, telegram_hata=True)
    sonuc = kasa.yazilan[0]
    assert kod == 0 and mesajlar == [] and sonuc["tur"]["durum"] == "kismi" and sonuc["tur"]["bildirim_hata"] == 1
    assert {g["durum"] for g in sonuc["gonderimler"]} == {"hata"}
    kod, mesajlar, _ = calistir(SahteKasa(gonderimler=sonuc["gonderimler"]))
    assert len(mesajlar) == 1


def test_B4_gunluk_bildirim_siniri_dolunca_mesaj_gitmez():
    kasa = SahteKasa(takipler=[takip(gunlukSinir=2)], sayilar={"aaaaaaaa": 2})
    kod, mesajlar, satirlar = calistir(kasa)
    assert kod == 0 and mesajlar == [] and kasa.yazilan[0]["gonderimler"] == []
    assert any("günlük bildirim sınırı doldu" in s for s in satirlar)


def test_deneme_kipi_bildirim_gondermez_ve_kasaya_yazmaz():
    kasa = SahteKasa()
    kod, mesajlar, satirlar = calistir(kasa, deneme=True)
    assert kod == 0 and mesajlar == [] and kasa.yazilan == []
    assert any("Deneme kipi" in s for s in satirlar)


def test_on_denetim_kanal_kasa_ya_da_kaynak_tanimsizsa_tur_calismaz():
    for eksik in (Ayarlar(tp_token="k" * 32, kasa_url="https://kasa.ornek.dev", kasa_token="r" * 64),
                  Ayarlar(tp_token="k" * 32, telegram_token=SAHTE_BOT, telegram_chat=SAHTE_SOHBET),
                  Ayarlar(kasa_url="https://kasa.ornek.dev", kasa_token="r" * 64, telegram_token=SAHTE_BOT, telegram_chat=SAHTE_SOHBET),
                  Ayarlar(tp_token="k" * 32, kasa_url="http://kasa.ornek.dev", kasa_token="r" * 64, telegram_token=SAHTE_BOT, telegram_chat=SAHTE_SOHBET)):
        kasa, kaynak = SahteKasa(), SahteKaynak()
        kod, mesajlar, _ = calistir(kasa, kaynak=kaynak, ayar=eksik)
        assert kod == 2 and mesajlar == [] and kasa.yazilan == [] and kaynak.sorgular == []


def test_kasaya_ulasilamazsa_tur_hata_ile_biter_ve_kaynak_sorgulanmaz():
    kaynak = SahteKaynak()
    kod, mesajlar, _ = calistir(SahteKasa(hata=True), kaynak=kaynak)
    assert kod == 1 and mesajlar == [] and kaynak.sorgular == []


def test_V4_kaynak_429_donerse_o_turda_durulur():
    takipler = [takip("aaaaaaaa"), takip("bbbbbbbb", varis={"kapsam": "havalimani", "havalimanlari": ["TZX"]})]
    kasa, kaynak = SahteKasa(takipler=takipler), SahteKaynak(hata=KaynakHatasi("sınır", 429))
    kod, mesajlar, _ = calistir(kasa, kaynak=kaynak)
    assert kod == 0 and len(kaynak.sorgular) == 1 and mesajlar == []
    sonuc = kasa.yazilan[0]
    assert sonuc["tur"]["durum"] == "kismi" and sonuc["tur"]["sorgu_hata"] == 1 and sonuc["kaynaklar"] == [{"kaynak": "travelpayouts", "durum": "hata"}]


def test_T6_suresi_dolan_takip_kapatilir_ve_bir_kez_bilgi_mesaji_gider():
    biten = takip(pencere={"bas": "2026-11-01", "bit": "2026-11-16"}, tarih={"bicim": "aralik", "baslangic": "2026-11-01", "bitis": "2026-11-16", "gunler": []})
    kasa, kaynak = SahteKasa(takipler=[biten]), SahteKaynak()
    kod, mesajlar, _ = calistir(kasa, kaynak=kaynak)
    assert kod == 0 and len(mesajlar) == 1 and "[TAKİP BİTTİ]" in mesajlar[0]
    assert kasa.yazilan[0]["suresiDolanlar"] == ["aaaaaaaa"] and kaynak.sorgular == []


def test_G3_tur_gunlugunde_rota_tarih_fiyat_ve_alici_bulunmaz(monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    for ek in ({}, {"deneme": True}):
        _, _, satirlar = calistir(SahteKasa(), **ek)
        metin = "\n".join(satirlar)
        for yasak in ["SAW", "ERZ", "Erzurum", "2026-12", "1249", "1.249", "1500", "Pegasus", SAHTE_SOHBET, SAHTE_BOT, "kasa.ornek"]:
            assert yasak not in metin, yasak
        assert "aaaaaaaa" in metin                             # takip yalnızca kısa kimliğiyle geçer


def test_kasa_istemcisi_anahtari_baslikta_gonderir_ve_hata_metninde_gostermez():
    istekler = []

    def gonder(yontem, url, basliklar, govde):
        istekler.append((yontem, url, basliklar))
        return 200, json.dumps({"takipler": []})

    kasa = Kasa("https://kasa.ornek.dev/", "cok-gizli-radar-anahtari-0123456789abcdef", gonder=gonder)
    assert kasa.takipler() == {"takipler": []}
    yontem, url, basliklar = istekler[0]
    assert url == "https://kasa.ornek.dev/api/ic/takipler" and "cok-gizli" not in url and basliklar["Authorization"].startswith("Bearer ")
    for yanit in ((401, "{}"), (500, "hata"), (200, "[1]")):
        with pytest.raises(KasaHatasi) as h:
            Kasa("https://kasa.ornek.dev", "cok-gizli-radar-anahtari-0123456789abcdef", gonder=lambda *a, y=yanit: y).takipler()
        assert "cok-gizli" not in str(h.value)
