"""Güvenlik: anahtar maskeleme, güvenli bağlantılar, yayın öncesi tarama, commit denetimi ve yayın betiği.

Yayın testi gerçek git ile yerel bir "uzak depo"ya gönderir; GitHub CLI (gh) sahte bir betikle taklit edilir.
İnternete çıkılmaz.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from conftest import ROOT
from radar import guvenlik, yayin

FAKE_TOKEN = "123456789:" + "AAH" + "x" * 32          # biçimi gerçek bir bot anahtarına benzer
FAKE_CHAT = "-1001234567890"
FAKE_PASSWORD = "cok-gizli-sifre-123"  # test için uydurma değer  # pragma: allowlist secret
FAKE_API_KEY = "0f" * 16                                # 32 haneli uydurma kaynak anahtarı
FAKE_NAME = "yasakliarac"                               # uydurma yasaklı ad
ATIF = "Co-Authored-" + "By: Birisi <birisi@ornek.com>"  # kaynakta bitişik yazılmaz


# ------------------------------------------------------------------ maskeleme ve bağlantılar

def test_anahtarlar_hata_metninde_maskelenir(monkeypatch):
    monkeypatch.setenv("SMTP_PASSWORD", FAKE_PASSWORD)
    monkeypatch.setenv("TRAVELPAYOUTS_TOKEN", FAKE_API_KEY)
    msg = f"hata: https://api.telegram.org/bot{FAKE_TOKEN}/sendMessage; pass={FAKE_PASSWORD}; key={FAKE_API_KEY}"
    out = guvenlik.redact(msg)
    assert FAKE_TOKEN not in out and FAKE_PASSWORD not in out and FAKE_API_KEY not in out and "***" in out
    # ortamda olmasa bile bilinen anahtar biçimi maskelenir; ek değerler de maskelenir
    monkeypatch.delenv("SMTP_PASSWORD")
    assert FAKE_TOKEN not in guvenlik.redact(f"token {FAKE_TOKEN}")
    assert FAKE_CHAT not in guvenlik.redact(f"alıcı {FAKE_CHAT}", [FAKE_CHAT])


def test_her_gizli_anahtar_maskelenir(monkeypatch):
    for i, key in enumerate(guvenlik.SECRET_ENV_KEYS):
        monkeypatch.setenv(key, f"gizli-deger-{i:02d}")
    text = " ".join(f"gizli-deger-{i:02d}" for i in range(len(guvenlik.SECRET_ENV_KEYS)))
    assert "gizli-deger" not in guvenlik.redact(text)


def test_kisa_degerler_maskelenmez(monkeypatch):
    monkeypatch.setenv("SMTP_USER", "587")
    assert guvenlik.redact("port 587") == "port 587"


def test_yalnizca_http_baglantilari_kullanilir():
    assert guvenlik.safe_url("javascript:alert(1)") is None
    assert guvenlik.safe_url(" data:text/html,x") is None
    assert guvenlik.safe_url("/goreli/yol") is None
    assert guvenlik.safe_url(None) is None
    assert guvenlik.safe_url("https://ornek.com/x") == "https://ornek.com/x"


# ------------------------------------------------------------------ yayın öncesi tarama

def test_tarama_gizli_ve_kisisel_bilgiyi_bulur(tmp_path):
    (tmp_path / "a.md").write_text(f"bot anahtarı: {FAKE_TOKEN}\n", encoding="utf-8")
    (tmp_path / "b.py").write_text(f"CHAT = '{FAKE_CHAT}'\n", encoding="utf-8")
    profile = "C:" + "\\Users\\ornekkisi"   # kaynakta bitişik yazılmaz; bu dosya da taranıyor
    (tmp_path / "c.txt").write_text(f"yol: {profile}\\Desktop\\proje\n", encoding="utf-8")
    (tmp_path / "d.json").write_text('{"ok": true}\n', encoding="utf-8")
    (tmp_path / "e.py").write_text(f"KEY = '{FAKE_API_KEY}'\nposta = 'kisi@ornek.com'\n", encoding="utf-8")
    (tmp_path / ".env").write_text("X=1\n", encoding="utf-8")
    env = {"TELEGRAM_BOT_TOKEN": FAKE_TOKEN, "TELEGRAM_CHAT_ID": FAKE_CHAT, "TRAVELPAYOUTS_TOKEN": FAKE_API_KEY}
    terms = yayin.scan_terms(env, {profile: "kişisel klasör yolu", "kisi@ornek.com": "kişisel e-posta adresi"})
    found = yayin.scan_files(tmp_path, ["a.md", "b.py", "c.txt", "d.json", "e.py", ".env"], terms)
    text = "\n".join(map(str, found))
    assert "a.md:1 · .env değeri (TELEGRAM_BOT_TOKEN)" in text and "a.md:1 · Telegram bot anahtarı" in text
    assert "b.py:1 · .env değeri (TELEGRAM_CHAT_ID)" in text
    assert "c.txt:1 · kişisel klasör yolu" in text
    assert "e.py:1 · .env değeri (TRAVELPAYOUTS_TOKEN)" in text
    assert "e.py:2 · kişisel e-posta adresi" in text
    assert ".env · gizli ayar dosyası" in text
    assert "d.json" not in text
    assert FAKE_TOKEN not in text and FAKE_API_KEY not in text  # bulgu satırları değerin kendisini göstermez


def test_tarama_yasakli_adi_bulur(tmp_path):
    (tmp_path / ".git" / "info").mkdir(parents=True)
    (tmp_path / yayin.FORBIDDEN_LIST).write_text(f"# yerel liste\n\n{FAKE_NAME}\n", encoding="utf-8")
    (tmp_path / "README.md").write_text(f"Bu proje {FAKE_NAME.upper()} ile yazıldı.\n", encoding="utf-8")
    (tmp_path / f"{FAKE_NAME}-notlar.md").write_text("temiz\n", encoding="utf-8")
    (tmp_path / "temiz.md").write_text("temiz\n", encoding="utf-8")
    names = yayin.forbidden_names(tmp_path)
    assert names == [FAKE_NAME]
    terms = yayin.scan_terms({}, {n: yayin.FORBIDDEN_LABEL for n in names})
    found = "\n".join(map(str, yayin.scan_files(tmp_path, ["README.md", f"{FAKE_NAME}-notlar.md", "temiz.md"], terms)))
    assert "README.md:1 · yasaklı ad" in found
    assert f"{FAKE_NAME}-notlar.md · yasaklı ad (dosya adında)" in found
    assert "temiz.md" not in found
    assert yayin.forbidden_names(tmp_path / "yok") == []  # liste yoksa (ör. Actions'ta) tarama boş geçer


def test_proje_dosyalarinda_gizli_bilgi_yok():
    proc = subprocess.run(["git", "ls-files", "-co", "--exclude-standard", "-z"], cwd=ROOT,
                          capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:  # proje henüz git deposu değil: tüm dosyalar
        files = [str(p.relative_to(ROOT)).replace("\\", "/") for p in ROOT.rglob("*")
                 if p.is_file() and not any(x in p.parts for x in (".git", "__pycache__", ".pytest_cache", ".venv"))
                 and p.name != ".env"]
    else:
        files = [f for f in proc.stdout.split("\0") if f]
    extra = {n: yayin.FORBIDDEN_LABEL for n in yayin.forbidden_names(ROOT)}
    found = yayin.scan_files(ROOT, files, yayin.scan_terms({}, extra))
    assert not found, "\n".join(map(str, found))


# ------------------------------------------------------------------ commit denetimi

def _log(*entries: tuple[str, str, str, str]) -> str:
    return "".join("\x1f".join(e) + "\x1e\n" for e in entries)


def test_commit_denetimi_atif_ve_eposta():
    noreply = "4242+OrnekKullanici@users.noreply.github.com"
    temiz = _log(("a" * 40, noreply, noreply, "İlk yayın\n\nAçıklama satırı\n"))
    assert yayin.commit_findings(temiz) == []
    atifli = _log(("b" * 40, noreply, noreply, f"Düzeltme\n\n{ATIF}\n"))
    assert any("Co-Authored-By" in p for p in yayin.commit_findings(atifli))
    kucuk = _log(("c" * 40, noreply, noreply, f"Düzeltme\n\n  {ATIF.lower()}\n"))
    assert yayin.commit_findings(kucuk)
    kisisel = _log(("d" * 40, "kisi@ornek.com", noreply, "Düzeltme\n"))
    assert any("yazar e-postası" in p for p in yayin.commit_findings(kisisel))
    assert "kisi@ornek.com" not in "\n".join(yayin.commit_findings(kisisel))


def test_commit_denetimi_gercek_depoda(tmp_path):
    if not shutil.which("git"):
        pytest.skip("git yok")

    def git(*args):
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init", "-q", "-b", "main")
    git("config", "user.name", "OrnekKullanici")
    git("config", "user.email", "4242+OrnekKullanici@users.noreply.github.com")
    assert yayin.commit_denetimi(tmp_path, out=lambda *_: None) == 0  # commit yokken
    (tmp_path / "a.txt").write_text("1\n", encoding="utf-8")
    git("add", "-A")
    git("commit", "-q", "-m", "ilk")
    assert yayin.commit_denetimi(tmp_path, out=lambda *_: None) == 0
    (tmp_path / "a.txt").write_text("2\n", encoding="utf-8")
    git("add", "-A")
    git("commit", "-q", "-m", f"ikinci\n\n{ATIF}")
    lines: list[str] = []
    assert yayin.commit_denetimi(tmp_path, out=lines.append) == 1
    assert any("Co-Authored-By" in x for x in lines)


# ------------------------------------------------------------------ yayın betiği (sahte gh ile)

FAKE_GH = r'''#!/usr/bin/env python3
import json, os, subprocess, sys
log = os.environ["SAHTE_GH_LOG"]
args = sys.argv[1:]
stdin = "" if sys.stdin is None or sys.stdin.isatty() else sys.stdin.read()
with open(log, "a", encoding="utf-8") as fh:
    fh.write(json.dumps({"args": args, "stdin": stdin}) + "\n")
if args[:2] == ["auth", "status"]:
    print("github.com\n  ✓ Logged in\n  - Token scopes: " + os.environ.get("SAHTE_GH_SCOPES", "'repo', 'workflow'"))
elif args[:2] == ["api", "-X"] and args[3] == "user":
    print(json.dumps({"login": "OrnekKullanici", "id": 4242}))
elif args[:2] == ["repo", "create"]:
    subprocess.run(["git", "remote", "add", "origin", os.environ["SAHTE_UZAK"]], check=True)
elif args[:2] == ["api", "-X"] and args[2] == "GET" and args[3].endswith("/rulesets"):
    print("[]")
elif args[:2] == ["api", "-X"] and args[2] == "GET" and args[3].endswith("/contributors"):
    print(json.dumps([{"login": "OrnekKullanici"}]))
elif args[:1] == ["api"]:
    print("{}")
'''


@pytest.fixture
def project(tmp_path, monkeypatch):
    if os.name == "nt" or not shutil.which("git"):
        pytest.skip("sahte gh betiği yalnızca Linux/macOS'ta çalışır")
    root = tmp_path / "proje"
    (root / ".github" / "workflows").mkdir(parents=True)
    for rel in yayin.WORKFLOWS:
        shutil.copy(ROOT / rel, root / rel)
    shutil.copy(ROOT / ".gitignore", root / ".gitignore")
    (root / "README.md").write_text("# Flight Ticket\n", encoding="utf-8")
    (root / "radar").mkdir()
    (root / "radar" / "__init__.py").write_text("", encoding="utf-8")
    (root / ".venv").mkdir()
    (root / ".venv" / "not.txt").write_text(FAKE_TOKEN, encoding="utf-8")  # .gitignore dışarıda bırakır
    (root / ".env").write_text(
        f"TELEGRAM_BOT_TOKEN={FAKE_TOKEN}\nTELEGRAM_CHAT_ID={FAKE_CHAT}\nSMTP_PASSWORD=\nEMAIL_TO=\n", encoding="utf-8")
    bare = tmp_path / "uzak.git"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(bare)], check=True)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    gh = bin_dir / "gh"
    gh.write_text(FAKE_GH, encoding="utf-8")
    gh.chmod(0o755)
    log = tmp_path / "gh.log"
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")
    monkeypatch.setenv("SAHTE_GH_LOG", str(log))
    monkeypatch.setenv("SAHTE_UZAK", str(bare))
    monkeypatch.setenv("HOME", str(tmp_path / "ev"))   # kişisel git ayarları teste karışmasın
    calls = lambda: [json.loads(x) for x in log.read_text(encoding="utf-8").splitlines()] if log.exists() else []
    return root, bare, calls


def test_yayin_guvenli_akis(project, capsys):
    root, bare, calls = project
    assert yayin.yayinla(root) == 0
    output = capsys.readouterr().out
    assert FAKE_TOKEN not in output and FAKE_CHAT not in output
    assert "yalnızca OrnekKullanici var" in output

    # Uzak depoda .env ve .venv yok; commit yazarı GitHub'ın gizli adresi; atıf satırı yok
    files = subprocess.run(["git", "ls-tree", "-r", "--name-only", "main"], cwd=bare, capture_output=True, text=True).stdout
    assert ".github/workflows/testler.yml" in files and "README.md" in files
    assert ".env" not in files.split() and ".venv/" not in files
    author = subprocess.run(["git", "log", "-1", "--format=%an <%ae>", "main"], cwd=bare, capture_output=True, text=True).stdout
    assert author.strip() == "OrnekKullanici <4242+OrnekKullanici@users.noreply.github.com>"
    body = subprocess.run(["git", "log", "-1", "--format=%B", "main"], cwd=bare, capture_output=True, text=True).stdout
    assert "co-authored-by" not in body.lower()

    log = calls()
    # Anahtarlar komut satırında değil, standart girdide
    assert not any(FAKE_TOKEN in " ".join(c["args"]) or FAKE_CHAT in " ".join(c["args"]) for c in log)
    secrets = {c["args"][2]: c["stdin"] for c in log if c["args"][:2] == ["secret", "set"]}
    assert secrets == {"TELEGRAM_BOT_TOKEN": FAKE_TOKEN, "TELEGRAM_CHAT_ID": FAKE_CHAT}
    create = next(c["args"] for c in log if c["args"][:2] == ["repo", "create"])
    assert "--public" in create and "--disable-issues" in create and "--disable-wiki" in create
    api = [(c["args"][2], c["args"][3], c["stdin"]) for c in log if c["args"][:1] == ["api"]]
    paths = [p for _, p, _ in api]
    full = "repos/OrnekKullanici/flight-ticket"
    for expected in (f"{full}/interaction-limits", f"{full}/actions/permissions/workflow", f"{full}/contributors",
                     f"{full}/vulnerability-alerts", f"{full}/rulesets", f"{full}/actions/permissions/selected-actions"):
        assert expected in paths, expected
    limits = next(json.loads(b) for m, p, b in api if p.endswith("/interaction-limits"))
    assert limits == {"limit": "collaborators_only", "expiry": "six_months"}
    perms = next(json.loads(b) for m, p, b in api if p.endswith("/actions/permissions/workflow"))
    assert perms["default_workflow_permissions"] == "read"


def test_yayin_gizli_bilgi_bulursa_hicbir_sey_gondermez(project):
    root, bare, calls = project
    (root / "README.md").write_text(f"# Flight Ticket\nanahtar: {FAKE_TOKEN}\n", encoding="utf-8")
    with pytest.raises(yayin.YayinHatasi) as err:
        yayin.yayinla(root)
    assert "README.md:2" in str(err.value) and FAKE_TOKEN not in str(err.value)
    assert not any(c["args"][:2] in (["repo", "create"], ["secret", "set"]) for c in calls())
    assert subprocess.run(["git", "rev-parse", "--verify", "main"], cwd=bare, capture_output=True).returncode != 0


def test_yayin_yasakli_ad_bulursa_hicbir_sey_gondermez(project):
    root, bare, calls = project
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=root, check=True)
    (root / yayin.FORBIDDEN_LIST).write_text(f"{FAKE_NAME}\n", encoding="utf-8")
    (root / "README.md").write_text(f"# Flight Ticket\n{FAKE_NAME} ile yazıldı\n", encoding="utf-8")
    with pytest.raises(yayin.YayinHatasi, match="yasaklı ad"):
        yayin.yayinla(root)
    assert not any(c["args"][:2] in (["repo", "create"], ["secret", "set"]) for c in calls())


def test_yayin_eksik_is_akisi_ve_izin(project, monkeypatch):
    root, _, _ = project
    monkeypatch.setenv("SAHTE_GH_SCOPES", "'gist', 'read:org', 'repo'")
    with pytest.raises(yayin.YayinHatasi, match="workflow"):
        yayin.yayinla(root)
    monkeypatch.setenv("SAHTE_GH_SCOPES", "'repo', 'workflow'")
    (root / ".github" / "workflows" / "testler.yml").unlink()
    with pytest.raises(yayin.YayinHatasi, match="testler.yml yok"):
        yayin.yayinla(root)


def test_yayin_deneme_modu_gondermez(project, capsys):
    root, bare, calls = project
    assert yayin.yayinla(root, dry_run=True) == 0
    assert "Deneme modu" in capsys.readouterr().out
    assert not any(c["args"][:2] in (["repo", "create"], ["secret", "set"]) for c in calls())
