"""Komut satırı: python -m radar <komut>

    python -m radar calistir          Bir radar turu çalıştırır
    python -m radar calistir --deneme Bildirim göndermeden, kasaya yazmadan tur; ne yapacağını yazar
    python -m radar kaynak-testi      Fiyat kaynağına ve kasaya erişimi dener
    python -m radar test-bildirim     Kurulu kanallara deneme mesajı gönderir
    python -m radar yayinla           Projeyi güvenlik taramasından geçirip GitHub'da yayınlar
    python -m radar commit-denetimi   Son commit'lerde atıf satırı ve kişisel e-posta arar
"""

from __future__ import annotations

import argparse


def _hazirla():
    from .config import ayarlari_oku, env_yukle

    env_yukle()
    return ayarlari_oku()


def cmd_calistir(args) -> int:
    from .kasa import Kasa
    from .kaynaklar.travelpayouts import Travelpayouts
    from .motor import tur

    ayar = _hazirla()
    return tur(ayar, kaynak=Travelpayouts(ayar.tp_token), kasa=Kasa(ayar.kasa_url, ayar.kasa_token), deneme=args.deneme, tetik=args.tetik)


def cmd_kaynak_testi(args) -> int:
    from .kasa import Kasa, KasaHatasi
    from .kaynaklar.travelpayouts import Travelpayouts

    ayar = _hazirla()
    kod = 0
    if not ayar.tp_token:
        print("✗ fiyat kaynağı: anahtar tanımlı değil")
        kod = 1
    else:
        tamam, bilgi = Travelpayouts(ayar.tp_token).erisim_testi()
        print(f"{'✓' if tamam else '✗'} fiyat kaynağı (travelpayouts): {bilgi}")
        kod = kod or (0 if tamam else 1)
    if not ayar.kasa_hazir:
        print("✗ kasa: adres ya da anahtar tanımlı değil")
        return 1
    try:
        veri = Kasa(ayar.kasa_url, ayar.kasa_token).takipler()
        print(f"✓ kasa: {len(veri.get('takipler', []))} etkin takip")
    except KasaHatasi as hata:
        print(f"✗ kasa: {hata}")
        kod = 1
    return kod


def cmd_test_bildirim(args) -> int:
    from .messages import deneme_mesaji
    from .notify import BildirimHatasi, telegram_gonder

    ayar = _hazirla()
    if "telegram" not in ayar.kanallar:
        print("✗ Telegram tanımlı değil (TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID).")
        return 1
    kod = 0
    for ad, sohbet in (("ana grup", ayar.telegram_chat), ("teknik grup", ayar.telegram_teknik)):
        if not sohbet:
            print(f"– Telegram {ad}: tanımlı değil, atlandı")
            continue
        try:
            telegram_gonder(ayar.telegram_token, sohbet, deneme_mesaji())
            print(f"✓ Telegram {ad}: gönderildi")
        except BildirimHatasi as hata:
            print(f"✗ Telegram {ad}: {hata}")
            kod = 1
    return kod


def cmd_yayinla(args) -> int:
    from .yayin import main as yayin_main

    return yayin_main(args)


def cmd_commit_denetimi(args) -> int:
    from .config import ROOT
    from .yayin import YayinHatasi, commit_denetimi

    try:
        return commit_denetimi(ROOT, args.adet)
    except YayinHatasi as exc:
        print(f"✗ {exc}")
        return 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m radar", description="Flight Ticket")
    sub = p.add_subparsers(dest="komut", required=True)

    c = sub.add_parser("calistir", help="Bir radar turu çalıştırır")
    c.add_argument("--deneme", action="store_true", help="Bildirim göndermeden, kasaya yazmadan çalışır")
    c.add_argument("--tetik", default="elle", choices=["elle", "zamanlayici", "yedek"], help="Turu neyin başlattığı")
    c.set_defaults(func=cmd_calistir)

    k = sub.add_parser("kaynak-testi", help="Fiyat kaynağına ve kasaya erişimi dener")
    k.set_defaults(func=cmd_kaynak_testi)

    t = sub.add_parser("test-bildirim", help="Kurulu kanallara deneme mesajı gönderir")
    t.set_defaults(func=cmd_test_bildirim)

    y = sub.add_parser("yayinla", help="Güvenlik taramasından geçirip GitHub'da yayınlar")
    y.add_argument("--deneme", action="store_true", help="Hiçbir şey göndermeden ne yapılacağını yazar")
    y.add_argument("--yalnizca-ayarlar", action="store_true", help="Dosya göndermeden Secrets ve depo ayarlarını uygular")
    y.add_argument("--depo", default="flight-ticket", help="Depo adı")
    y.add_argument("--gizli", action="store_true", help="Depoyu gizli oluşturur")
    y.set_defaults(func=cmd_yayinla)

    d = sub.add_parser("commit-denetimi", help="Son commit'lerde atıf satırı ve kişisel e-posta arar")
    d.add_argument("--adet", type=int, default=50, help="Denetlenecek commit sayısı")
    d.set_defaults(func=cmd_commit_denetimi)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)
