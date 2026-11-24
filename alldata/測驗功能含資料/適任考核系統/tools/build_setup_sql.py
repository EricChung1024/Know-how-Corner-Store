"""把 supabase/001～004 合併成 setup.sql，方便一次貼進 Supabase SQL Editor。不含題庫資料與測試。"""
import re
import sys
from pathlib import Path

HEADER = "-- 適任考核系統：資料庫安裝腳本（自動合併 001～004，請勿手改；改 001～004 後執行 tools/build_setup_sql.py）\n"


def build(sup_dir: str) -> str:
    parts = [HEADER]
    for f in sorted(Path(sup_dir).iterdir()):
        if re.fullmatch(r"\d{3}_.*\.sql", f.name):
            parts.append(f"\n-- ===== {f.name} =====\n" + f.read_text(encoding="utf-8").rstrip() + "\n")
    return "".join(parts)


if __name__ == "__main__":
    sup = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "supabase"
    (sup / "setup.sql").write_text(build(str(sup)), encoding="utf-8", newline="\n")
    print("wrote", sup / "setup.sql")
