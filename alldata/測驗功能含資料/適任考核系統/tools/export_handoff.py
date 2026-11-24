"""產生「評分系統資料包」：題庫（含標準答案與得分點）、總表原始資料、題目→規則對照、資料庫快照、資料表結構與說明文件。
內容含標準答案，只放本機，不要提交、不要放上公開網站。"""
import collections
import csv
import json
import shutil
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_questions as bq  # noqa: E402
import export_questions as eq  # noqa: E402
from xlsx_reader import read_rows, sheet_names  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
TOP = "評分系統資料包"
SITE_URL = "https://ericchung1024.github.io/AISOP-exam/"
SUPABASE_REF = "pdfdyuahpshrrdwkvyyh"


def _write_csv(path: Path, rows, header=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        if header:
            w.writerow(header)
        w.writerows(rows)


def _case_rows(case_map, rules):
    rule_name = {r[0]: r[2] for r in rules}
    with (ROOT / "AI專屬客服測驗" / "題庫案例來源.tsv").open(encoding="utf-8-sig", newline="") as f:
        src = list(csv.DictReader(f, delimiter="|"))
    rows = []
    for i, c in enumerate(src, 1):
        cid = f"C{i:03d}"
        e = case_map.get(cid)
        if e:
            ids = e["rules"]
            rows.append([cid, c["主題"], c["情境"], "總表延伸", "、".join(ids), "、".join(rule_name.get(x, "") for x in ids), 7,
                         "依總表規則改寫答案、得分點與選擇題的正確回覆"])
        else:
            rows.append([cid, c["主題"], c["情境"], "維持原通用內容（總表無對應規則）", "", "", 7,
                         "總表沒有對應的規則，未編造制度；內容為通用電商客服原則，題目標示未審核"])
    return rows


def _stats(questions):
    by_src = collections.Counter((q["source"], q["qtype"]) for q in questions)
    return {
        "total": len(questions),
        "reviewed": sum(1 for q in questions if q["reviewed"]),
        "rules": sum(1 for q in questions if q["source"] == "rules"),
        "ext": sum(1 for q in questions if q["source"] == "rules_ext"),
        "legacy": sum(1 for q in questions if q["source"] == "legacy"),
        "short": sum(1 for q in questions if q["qtype"] == "short"),
        "choice": sum(1 for q in questions if q["qtype"] != "short"),
        "red": sum(1 for q in questions if q["red_line"]),
        "by_src": by_src,
        "by_stage": collections.Counter(q["stage"] for q in questions),
    }


def readme_text(s, db):
    stages = "、".join(f"第{k}章 {v}" for k, v in sorted(s["by_stage"].items()))
    attempts = len(db.get("attempts", []))
    answers = len(db.get("attempt_answers", []))
    return f"""# 評分系統資料包（交接用）

> **內容含標準答案、得分點與考生作答，只在內部流通，不要放上公開網站或公開 repo。**

這包資料是「適任考核系統」目前的全部內容，給接手做**評分系統**的人使用。資料全為虛構（好物集客服 SOP）。

## 一、先看這裡：系統現況

| 項目 | 內容 |
|---|---|
| 網站 | {SITE_URL}（靜態前端，GitHub Pages；repo：`EricChung1024/AISOP-exam`） |
| 原始碼與文件 | repo `EricChung1024/AISOP`，資料夾 `適任考核系統/`（含設計文件、實作計畫、測試） |
| 後端 | Supabase 專案 `{SUPABASE_REF}`（登入、資料庫、權限規則、評分函式） |
| 新增員工 | Supabase Edge Function `create-employees`（主管專用） |
| 資料庫快照時間 | {db.get('exported_at', '—')}（目前 {attempts} 份考卷、{answers} 筆作答，是測試資料） |

## 二、資料包內容

| 路徑 | 說明 |
|---|---|
| `data/題庫_全部.csv` | 全部 {s['total']} 題，Excel 可直接開（UTF-8 含 BOM）。含正確答案、解析、得分點、錯誤類型、來源、審核狀態 |
| `data/題庫_全部.json` | 同上，完整欄位的機器可讀版（與資料庫 `questions` 表一致） |
| `data/總表/*.csv` | 「統整結果_標準答案總表」8 個工作表的原始內容（規則總表、經驗談、傳言、新人問答等）。**這是所有標準答案的最終依據** |
| `data/案例對照_題目到總表規則.csv` | 舊題庫 100 個案例各自對應到哪條總表規則，或為何沒有對應 |
| `data/db_snapshot.json` | 資料庫目前的資料（分級設定、使用者、考卷、作答、錯題）。使用者信箱不在其中 |
| `schema/setup.sql` | 完整資料表、權限規則與函式（可在乾淨的 Supabase 專案重建） |

## 三、題庫組成（請先了解品質差異）

共 **{s['total']}** 題：選擇／是非 {s['choice']} 題、情境簡答 {s['short']} 題；紅線題 {s['red']} 題。**只有 {s['reviewed']} 題已審核**。

| 來源（`source`） | 題數 | 說明 | 審核 |
|---|---|---|---|
| `rules` 總表規則題 | {s['rules']} | 由總表的現行規則、紅線、新舊衝突、傳言、經驗談直接產生。答案與干擾選項（舊版寫法）都來自總表 | 已審核 |
| `rules_ext` 總表延伸 | {s['ext']} | 舊題庫的情境，**答案與得分點改依總表規則改寫**（64 個案例 × 7 題）。改寫內容由 AI 撰寫、依總表規則為準 | **未審核**，建議人工抽查 |
| `legacy` 舊題庫 | {s['legacy']} | 36 個案例在總表找不到對應規則，維持原本的**通用**內容（沒有具體數字或期限） | **未審核**，不建議直接拿來評分 |

各章題數：{stages}。

提醒：
- 綜合、試用期、半年考核只抽**已審核**題，所以目前只用 {s['reviewed']} 題；章節考核則含未審核題。
- `legacy` 選擇題的解析寫「A 錯誤／B 正確」，所以 `shuffle = false`（選項順序固定）；其餘題目每次抽題都會打亂選項。
- 簡答題的 `rubric`（得分點）是字串陣列：`rules_ext` 由答案以「；」切成要點；`legacy` 只有一個要點。多輪追問題（`L-D###`）的得分點是兩條：回覆重點、判斷邊界。

## 四、目前的評分邏輯（`supabase/setup.sql` 的 003、004）

**選擇題／是非題（自動評分）**
- 交卷（`submit_exam`）時，伺服器把員工選的選項還原成「原始選項 index」，與 `questions.correct_index` 比對。沒作答＝答錯。
- 選項順序隨機，打亂後的順序存在 `attempts.question_ids[].perm`（`perm[畫面位置] = 原始 index`）。`attempt_answers.choice` 存的是**原始 index**，不是畫面位置。

**情境簡答題（自評＋主管覆核）**
- 交卷後狀態變 `pending_selfcheck`，才揭曉參考答案與得分點；員工逐項勾選「我有做到」（`submit_selfcheck`）。
- 題分 ＝ 勾選數 ÷ 得分點數（0–1）；**空白作答一律 0 分**（不能靠勾選拿分）。
- 主管可在員工詳情頁覆核並調整單題分數（`adjust_short_score`，0–1），整份考卷會重算。

**總分與及格**
- `總分 = 100 × (0.8 × 選擇題答對率 + 0.2 × 簡答平均得分)`；只有一種題型時，該題型佔 100%。四捨五入到小數一位。
- 及格分由 `assessments.pass_score` 決定：章節 80、綜合 80、試用期 80、半年 85。階段編號：1–9 章節、0 綜合、10 試用期考核、11 半年考核。

**錯誤類型（`error_type`）與細節（`error_detail`）**
- `用了舊規則`（細節＝選到的是哪一版舊文件，例：2022 手冊）、`違反紅線`、`被舊資訊誤導`、`把傳言當規定`、`應對方式不當`、`情境判斷失誤`。
- 簡答題未得滿分時：`error_type` 取題目的錯誤類型，`error_detail` 取題目的 `key_error`（關鍵失誤）。

**錯題區（`wrong_book`）**
- 答錯（或簡答未得滿分）自動收進；重練（`start_practice`／`submit_practice`，只含選擇題）連續答對 2 次 → `mastered`；重練**不計入**成績。

## 五、資料表欄位字典

| 表 | 重點欄位 |
|---|---|
| `profiles` | `id`（＝auth 使用者 id）、`name`、`role`（`employee`／`supervisor`）、`hire_date` |
| `assessments` | `stage` 0–11、`name`、`kind`、`total_questions`、`short_max`、`pass_score`、`red_min`（紅線題保底）、`interval_months` |
| `questions` | `id`、`stage`(1–9)、`qtype`(`mcq`/`tf`/`short`)、`stem`、`options`(jsonb)、`correct_index`、`explanation`、`error_type`、`error_detail`、`option_errors`(jsonb，與選項對位，記每個干擾選項對應的舊版文件)、`reference_answer`、`rubric`(jsonb)、`key_error`、`source`、`source_ref`、`reviewed`、`red_line`、`shuffle` |
| `attempts` | `id`、`user_id`、`stage`、`question_ids`(jsonb，題目順序與 `perm`)、`status`(`in_progress`/`pending_selfcheck`/`done`)、`score`、`passed`、`started_at`、`submitted_at` |
| `attempt_answers` | 主鍵 (`attempt_id`,`question_id`)；`choice`(原始 index)、`text_answer`、`checked`(自評勾選的得分點 index)、`points`、`is_correct`、`error_type`、`error_detail` |
| `wrong_book` | 主鍵 (`user_id`,`question_id`)；`wrong_count`、`streak`、`status`、`note`、`last_wrong_at` |
| `practice_runs` | 重練的抽題紀錄（`question_ids`、`closed`） |

`source_ref` 的格式：`rules` ＝總表規則編號（例 `7-9`）；`rules_ext` ＝`案例編號:規則編號`（例 `C001:2-2`，多條用 `+` 連接）；`legacy` ＝舊題號。

權限：所有資料表只開放登入者**讀取**自己的資料（主管讀全部）；`questions`、`practice_runs` 對用戶端完全不開放；寫入一律經過 `security definer` 函式。

## 六、後端函式（RPC）一覽

| 函式 | 誰能用 | 用途 |
|---|---|---|
| `start_exam(p_stage)` | 登入者 | 抽題並建立考卷，回傳題幹與選項（**不含答案**） |
| `submit_exam(p_attempt, p_answers)` | 登入者 | 評選擇題；有簡答則回 `pending_selfcheck` 與參考答案、得分點 |
| `submit_selfcheck(p_attempt, p_checks)` | 登入者 | 簡答自評，結算分數與是否及格 |
| `list_wrong`、`start_practice`、`submit_practice`、`set_wrong_note`、`set_wrong_status` | 登入者 | 錯題區 |
| `adjust_short_score`、`set_reviewed`、`list_questions_for_review`、`get_employee_detail`、`set_hire_date` | 主管 | 覆核與管理 |

錯誤代碼（`raise exception` 的訊息）：`NOT_AUTHENTICATED`、`BAD_STAGE`、`NO_QUESTIONS`、`ATTEMPT_CLOSED`、`NO_WRONG`、`BAD_STATUS`、`BAD_POINTS`、`FORBIDDEN`、`NOT_FOUND`。

## 七、做評分系統時建議先處理的缺口

1. **簡答題只能自評**：員工自己對照參考答案勾得分點，主管事後覆核。可考慮改為 AI 初評＋主管複評，並保存評分理由。`rubric`、`key_error`、`reference_answer` 就是為此準備的。
2. **`rules_ext` 448 題尚未人工審核**：先抽樣檢查答案是否忠於總表，再批次標為已審核（網站「主管後台 → 題庫審核」可做）。
3. **評分一致性**：目前沒有評分者之間的校準、題目鑑別度或難度統計；`attempt_answers` 已保存每題作答，可據此分析。
4. **自評中途關頁的考卷**會停在 `pending_selfcheck`，不計入成績，也沒有「繼續自評」入口。
5. **權重與及格分**（80/20、80/85 分）都是暫定值，存在 `assessments` 與 `submit_exam` 的公式裡，可依公司制度調整。
6. 「試用期 3 個月」寫死在資料庫 view `v_assessment_status`，尚未放進設定表。

## 八、安全與使用規範

- 標準答案只存在資料庫，員工在交卷前拿不到；請維持這個原則，**不要把答案放進前端或公開 repo**。
- 管理者金鑰（service role／secret key）只能放在後端函式環境變數，不可出現在任何檔案。
- 部署前先跑 `適任考核系統/tools/check_site_safe.py`；Supabase 請關閉「Allow new users to sign up」。
"""


def build_package(out_dir, questions_json, xlsx_path, db_snapshot, setup_sql):
    out = Path(out_dir)
    if out.exists():
        shutil.rmtree(out)
    (out / "data").mkdir(parents=True)
    questions = json.loads(Path(questions_json).read_text(encoding="utf-8"))
    eq.export_csv(questions, str(out / "data" / "題庫_全部.csv"))
    (out / "data" / "題庫_全部.json").write_text(
        json.dumps(sorted(questions, key=lambda q: (q["stage"], q["id"])), ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")

    for name in sheet_names(xlsx_path):
        _write_csv(out / "data" / "總表" / f"{name}.csv", read_rows(xlsx_path, name))

    rules = read_rows(xlsx_path, "規則總表")[1:]
    _write_csv(out / "data" / "案例對照_題目到總表規則.csv", _case_rows(bq.load_case_map(), rules),
               ["案例編號", "舊主題", "情境", "處理方式", "對應總表規則", "對應規則主題", "展開題數", "說明"])

    db = json.loads(Path(db_snapshot).read_text(encoding="utf-8"))
    (out / "data" / "db_snapshot.json").write_text(json.dumps(db, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
    (out / "schema").mkdir()
    shutil.copyfile(setup_sql, out / "schema" / "setup.sql")

    stats = _stats(questions)
    (out / "00_請先讀我.md").write_text(readme_text(stats, db), encoding="utf-8", newline="\n")
    return {"questions": stats["total"], "dir": str(out)}


def make_zip(pkg_dir, zip_path):
    pkg = Path(pkg_dir)
    Path(zip_path).parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(pkg.rglob("*")):
            if f.is_file():
                z.write(f, f"{TOP}/{f.relative_to(pkg).as_posix()}")
    return zip_path


if __name__ == "__main__":
    base = ROOT / "適任考核系統"
    out = base / "交接" / TOP
    q = base / "tools" / "out" / "questions.json"
    bq.main(str(q))
    info = build_package(str(out), str(q), str(ROOT / "統整結果_標準答案總表.xlsx"),
                         str(base / "tools" / "out" / "db_snapshot.json"), str(base / "supabase" / "setup.sql"))
    z = make_zip(str(out), str(base / "交接" / f"{TOP}.zip"))
    print(info["questions"], "題 →", out, "與", z)
