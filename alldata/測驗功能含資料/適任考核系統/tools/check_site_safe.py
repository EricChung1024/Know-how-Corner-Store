"""部署前檢查 site/：不得含 service_role／secret 金鑰、非 anon 的 JWT、題庫答案檔。回傳違規清單（空＝安全）。"""
import base64
import json
import re
import sys
from pathlib import Path

JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*")
FORBIDDEN_NAMES = {"questions.json", "seed.sql"}
FORBIDDEN_SUFFIXES = {".xlsx", ".csv", ".tsv"}


def _jwt_role(payload_b64: str):
    try:
        raw = base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4))
        return json.loads(raw).get("role")
    except Exception:
        return None


def scan(site_dir: str) -> list:
    problems = []
    root = Path(site_dir)
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(root).as_posix()
        if p.name in FORBIDDEN_NAMES or p.suffix.lower() in FORBIDDEN_SUFFIXES:
            problems.append(f"{rel}: 題庫／答案檔不得放進網站")
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue  # 二進位檔（字體等）
        if "service_role" in text:
            problems.append(f"{rel}: 出現 service_role")
        if "sb_secret_" in text:
            problems.append(f"{rel}: 出現 sb_secret_ 金鑰")
        for m in JWT_RE.finditer(text):
            role = _jwt_role(m.group(1))
            if role is not None and role != "anon":
                problems.append(f"{rel}: JWT 的 role 是 {role}（只允許 anon）")
    return problems


if __name__ == "__main__":
    out = scan(sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[1] / "site"))
    print("\n".join(out) if out else "OK：site/ 沒有發現機密或答案檔")
    sys.exit(1 if out else 0)
