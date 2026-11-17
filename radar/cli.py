"""Komut satırı: python -m radar <komut>

    python -m radar yayinla           Projeyi güvenlik taramasından geçirip GitHub'da yayınlar
    python -m radar commit-denetimi   Son commit'lerde atıf satırı ve kişisel e-posta arar

Radar turu, kaynak testi ve bildirim komutları sonraki fazlarda eklenir.
"""

from __future__ import annotations

import argparse


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
    p = argparse.ArgumentParser(prog="python -m radar", description="Flight Ticket Radar")
    sub = p.add_subparsers(dest="komut", required=True)

    y = sub.add_parser("yayinla", help="Güvenlik taramasından geçirip GitHub'da yayınlar")
    y.add_argument("--deneme", action="store_true", help="Hiçbir şey göndermeden ne yapılacağını yazar")
    y.add_argument("--yalnizca-ayarlar", action="store_true", help="Dosya göndermeden Secrets ve depo ayarlarını uygular")
    y.add_argument("--depo", default="flight-ticket-radar", help="Depo adı")
    y.add_argument("--gizli", action="store_true", help="Depoyu gizli oluşturur")
    y.set_defaults(func=cmd_yayinla)

    c = sub.add_parser("commit-denetimi", help="Son commit'lerde atıf satırı ve kişisel e-posta arar")
    c.add_argument("--adet", type=int, default=50, help="Denetlenecek commit sayısı")
    c.set_defaults(func=cmd_commit_denetimi)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)
