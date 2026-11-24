# make_data.py｜從「03_統整模擬資料包_v3」的 JSON 產生網頁用資料檔
#   data/demo_data.js  → 網頁目前用的資料（全域變數 DATA）
#   data/v3_all.js     → 5 個 JSON 原封不動包成一個檔（全域變數 V3），給問答、測驗、評分頁使用
# 用法：python tools/make_data.py            （在 02_網頁原始碼 資料夾裡執行）
#       python tools/make_data.py --check    （只檢查，不寫檔：確認 data/ 和 v3 JSON 完全一致）
# 注意：v3 JSON 是全組共用的標準資料，請不要修改；網頁要改資料，一律從 JSON 重新產生。
import json, sys
from collections import OrderedDict as OD
from pathlib import Path

SRC = Path(__file__).resolve().parents[1]                     # 02_網頁原始碼
JSON_DIR = SRC.parent / "03_統整模擬資料包_v3" / "05_網頁用資料（JSON）"
FILES = ["sop_latest", "sop_history", "review", "qa_cases", "settings"]


def load():
    if not JSON_DIR.exists():
        sys.exit(f"找不到 JSON 資料夾：{JSON_DIR}")
    return {name: json.load(open(JSON_DIR / f"{name}.json", encoding="utf-8")) for name in FILES}


def ev_text(evidence):
    if not evidence:
        return ""
    e = evidence[0]
    return e["label"] + " " + e["time"] + " 說：「" + e["quote"] + "」"


def demo_data(J):
    L, H, RV = J["sop_latest"], J["sop_history"], J["review"]
    demo = OD(
        files=[OD(name=x["file"], kind="教學逐字稿" if x["kind"] == "教學逐字稿" else "舊檔", format=x["format"], date=x["date"]) for x in RV["inputs"]],
        cleaning=RV["cleaning"], summary=RV["summary"],
        batches=[OD(bucket=b["bucket"], title=b["title"], buttons=b["buttons"],
                    items=[OD(id=i["id"], no=i["no"], topic=i["topic"], proposed=i["proposed"], older=i["older"], ev=ev_text(i["evidence"]))
                           for i in b["items"]]) for b in RV["batches"]],
        questions=[OD(id=q["id"], no=q["no"], topic=q["topic"], bucket_name=q["bucket_name"], ask=q["ask"], context=q["context"],
                      ev=ev_text(q["evidence"]), options=q["options"], ai_pick=q["ai_pick"], why=q["why"],
                      simulated=q["simulated_answer"], result_rule=q["result_rule"]) for q in RV["questions"]],
        chapters=L["chapters"],
        rules=[OD(id=r["id"], no=r["no"], ch=r["chapter"], topic=r["topic"], rule=r["rule"], red=r["red_line"],
                  eff=r["detail"]["effective"], basis=r["detail"]["basis"], law=r["detail"]["law"], how=r["detail"]["confirm_type"],
                  old=[x["label"] + "：" + x["text"] for x in r["detail"]["changed_from"]]) for r in L["rules"]],
        tips=[OD(ch=t["chapter"], type=t["customer_type"], tip=t["tip"]) for t in L["tips"]],
        tools=L["tools"],
        expired=[OD(topic=r["topic"], text=r["latest"], until=r["expires"]) for r in H["rules"] if r["status"] == "已失效"],
        rumors=[OD(who=r["who"], text=r["text"], date=r["date"]) for r in H["rumors"]],
        handover=RV["handover_cards"],
    )
    return "const DATA = " + json.dumps(demo, ensure_ascii=False) + ";\n"


def v3_all(J):
    return "const V3 = " + json.dumps(OD((k, J[k]) for k in FILES), ensure_ascii=False) + ";\n"


def main():
    J = load()
    out = {SRC / "data" / "demo_data.js": demo_data(J), SRC / "data" / "v3_all.js": v3_all(J)}
    if "--check" in sys.argv:
        ok = True
        for path, text in out.items():
            same = path.exists() and path.read_text(encoding="utf-8") == text
            ok &= same
            print(("一致　" if same else "不一致") + "｜" + path.relative_to(SRC).as_posix())
        print("結果：網頁資料與 v3 JSON 完全一致" if ok else "結果：有不一致，請執行 python tools/make_data.py 重新產生")
        sys.exit(0 if ok else 1)
    for path, text in out.items():
        path.parent.mkdir(exist_ok=True)
        path.write_text(text, encoding="utf-8")
        print("已產生", path.relative_to(SRC).as_posix())


if __name__ == "__main__":
    main()
