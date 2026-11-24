"""把題庫（questions.json）匯出成 Excel 可直接開啟的 CSV（UTF-8 含 BOM）。含正確答案與解析，勿放進 site/。"""
import csv
import json
import sys
from pathlib import Path

STAGE_NAMES = {
    0: "綜合適任考核",
    1: "第 1 章 基本規定（工單、檔案、服務時間）",
    2: "第 2 章 身分驗證與回覆時效",
    3: "第 3 章 商品資訊與缺貨",
    4: "第 4 章 優惠券與活動",
    5: "第 5 章 訂單、收件資料與發票",
    6: "第 6 章 物流與配送",
    7: "第 7 章 退換貨與退款",
    8: "第 8 章 客訴與升級",
    9: "第 9 章 工單與結案",
}
QTYPE = {"mcq": "選擇題", "tf": "是非題", "short": "情境簡答"}
SOURCE = {"rules": "總表規則", "rules_ext": "總表延伸（舊案例依總表改寫）", "legacy": "舊題庫（通用內容，未對應總表）"}
LETTERS = "ABCD"
HEADERS = ["題號", "階段", "題型", "題幹", "選項A", "選項B", "選項C", "選項D", "正確答案", "正確答案內容",
           "解析", "參考答案", "得分點", "錯誤類型", "來源", "來源編號", "審核狀態", "紅線題", "選項順序固定"]


def stage_name(stage: int) -> str:
    return STAGE_NAMES[stage]


def _row(q: dict) -> dict:
    opts = q.get("options") or []
    ci = q.get("correct_index")
    row = {
        "題號": q["id"], "階段": stage_name(q["stage"]), "題型": QTYPE[q["qtype"]], "題幹": q["stem"],
        "解析": q.get("explanation") or "", "參考答案": q.get("reference_answer") or "",
        "得分點": " ／ ".join(q.get("rubric") or []), "錯誤類型": q.get("error_type") or "",
        "來源": SOURCE.get(q.get("source"), q.get("source") or ""), "來源編號": q.get("source_ref") or "",
        "審核狀態": "已審核" if q.get("reviewed") else "待主管審核",
        "紅線題": "是" if q.get("red_line") else "", "選項順序固定": "" if q.get("shuffle", True) else "是",
        "正確答案": "", "正確答案內容": "",
    }
    for i, letter in enumerate(LETTERS):
        row["選項" + letter] = opts[i] if i < len(opts) else ""
    if ci is not None and opts:
        row["正確答案"] = LETTERS[ci]
        row["正確答案內容"] = opts[ci]
    return row


def export_csv(questions, path: str) -> int:
    rows = [_row(q) for q in sorted(questions, key=lambda q: (q["stage"], q["id"]))]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS)
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def main(json_path: str, csv_path: str) -> int:
    return export_csv(json.loads(Path(json_path).read_text(encoding="utf-8")), csv_path)


if __name__ == "__main__":
    print(main(sys.argv[1], sys.argv[2]), "questions exported")
