"""由總表與舊題庫產生題庫 questions.json。"""
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # python -I 不含腳本目錄

OLD_COLS = ["2022 手冊", "2023 簡報", "2024 檢核表", "2025 小抄"]


def clean(text: str) -> str:
    """去掉總表裡的〔…〕編輯註記（例：〔與法規不符〕），否則會洩漏哪個選項是錯的。"""
    return re.sub(r"〔[^〕]*〕", "", text or "").strip()


def stage_of(rule_no):
    m = re.match(r"(\d+)-", rule_no)
    return int(m.group(1)) if m else None


def _base(qid, stage, qtype, stem, options, correct, explanation, error_type, source_ref,
          option_errors=None, red_line=False):
    return {
        "id": qid, "stage": stage, "qtype": qtype, "stem": stem, "options": options,
        "correct_index": correct, "explanation": explanation, "error_type": error_type,
        "error_detail": None, "option_errors": option_errors or [None] * len(options),
        "source": "rules", "source_ref": source_ref, "reviewed": True, "red_line": red_line, "shuffle": True,
    }


def _shuffled(qid, options, errors):
    """依題號固定亂數打亂選項，保證重跑結果一致。回傳 (options, option_errors, correct_index)。"""
    order = list(range(len(options)))
    random.Random(qid).shuffle(order)
    return [options[i] for i in order], [errors[i] for i in order], order.index(0)


def _old_versions(rule):
    """回傳 [(欄名, 文字)]：與最新版不同、去重後的舊版寫法。"""
    seen, out = {clean(rule["最新版規則"])}, []
    for col in OLD_COLS:
        text = clean(rule.get(col, ""))
        if text and text not in seen:
            seen.add(text)
            out.append((col, text))
    return out


def rule_questions(rules):
    out = []
    for r in rules:
        if r["狀態"] != "現行":
            continue
        qid, no, red = "R-" + r["編號"], r["編號"], r["紅線"] == "★"
        olds = _old_versions(r)[:3]
        latest = clean(r["最新版規則"])
        expl = f"現行規定（{r['依據']}，{r['生效日']} 生效）：{latest}"
        if olds:
            options = [latest] + [t for _, t in olds]
            errors = [None] + [c for c, _ in olds]
            options, errors, ci = _shuffled(qid, options, errors)
            out.append(_base(qid, stage_of(no), "mcq", f"關於「{r['主題']}」，下列哪一項是現行有效的規定？",
                             options, ci, expl, "用了舊規則", no, errors, red))
        else:
            out.append(_base(qid, stage_of(no), "tf",
                             f"以下是「{r['主題']}」的現行規定嗎？\n「{latest}」",
                             ["是", "否"], 0, expl, "用了舊規則", no, None, red))
    return out


def redline_questions(rules):
    out = []
    for r in rules:
        if r["紅線"] != "★":
            continue
        no, olds = r["編號"], _old_versions(r)
        if olds:
            col, text = olds[0]
            stem = f"處理「{r['主題']}」時，若照以下做法，是否違反現行紅線規定？\n「{text}」"
            options, ci = ["違反紅線", "符合規定"], 0
            expl = f"這是{col}的舊寫法，已被取代。現行規定：{clean(r['最新版規則'])}"
        else:
            stem = f"處理「{r['主題']}」時，若照以下做法，是否違反現行紅線規定？\n「{clean(r['最新版規則'])}」"
            options, ci = ["違反紅線", "符合規定"], 1
            expl = f"這就是現行規定（{r['依據']}）：{clean(r['最新版規則'])}"
        out.append(_base("RL-" + no, stage_of(no), "tf", stem, options, ci, expl, "違反紅線", no, None, True))
    return out


def conflict_questions(qa_rows):
    out = []
    for q in qa_rows:
        old_text = q["再翻舊版"].strip()
        if "請問資深" in q["判斷"] or len(old_text) < 3 or old_text.startswith("無"):
            continue  # 沒有可對照的舊版（空白、「—」、「無」）就不成衝突題
        m = re.search(r"SOP (\d+-\d+)", q["先查最新版"])
        if not m:
            continue
        qid = "QA-" + q["編號"]
        options = [f"以最新版為準：{q['先查最新版']}", f"以舊版所寫為準：{q['再翻舊版']}"]
        options, errors, ci = _shuffled(qid, options, [None, "舊版說法"])
        out.append(_base(qid, stage_of(m.group(1)), "mcq", f"客人說：「{q['新人問']}」你該怎麼判斷？",
                         options, ci, q["AI 應該怎麼回"], "被舊資訊誤導", q["先查最新版"], errors))
    return out


def rumor_questions(rumor_rows):
    out = []
    for r in rumor_rows:
        m = re.search(r"SOP (\d+-\d+)", r["處理"])
        out.append(_base("RU-" + r["代碼"], stage_of(m.group(1)), "tf",
                         f"群組裡有人說：「{r['內容']}」這個說法可以直接當作依據回覆客人嗎？",
                         ["可以", "不可以，需以主管公告的 SOP 為準"], 1, r["處理"], "把傳言當規定", r["代碼"]))
    return out


def tip_questions(tip_rows):
    usable = [t for t in tip_rows if t["客人類型"] != "所有客人"]
    out = []
    for t in usable:
        qid = "TIP-" + t["代碼"]
        rng = random.Random(qid)
        wrong = rng.sample([x for x in usable if x is not t], 2)
        options = [t["怎麼應對"]] + [w["怎麼應對"] for w in wrong]
        options, errors, ci = _shuffled(qid, options, [None, "應對方式不當", "應對方式不當"])
        first = re.match(r"\d+", t["相關編號"] or "")
        out.append(_base(qid, int(first.group(0)) if first else 8, "mcq",
                         f"遇到「{t['客人類型']}」，下列哪一種應對最適當？", options, ci,
                         f"建議做法：{t['怎麼應對']}", "應對方式不當", t["代碼"], errors))
    return out


# ---------- 舊題庫 ----------
TOPIC_TO_STAGE = {
    "身分核對": 2, "訂單查詢": 2,
    "缺貨": 3, "預購": 3,
    "促銷": 4,
    "取消訂單": 5, "修改訂單": 5, "付款": 5, "發票": 5,
    "物流追蹤": 6, "超商取貨": 6, "瑕疵與缺件": 6,
    "退貨": 7, "換貨": 7, "退款": 7,
    "客訴": 8, "風險訂單": 8,
    "交接與結案": 9,
    "知識治理": 1, "跨通路": 1,
}
LEGACY_ERROR = "情境判斷失誤"


def _legacy(qid, topic, qtype, stem, **kw):
    q = {
        "id": qid, "stage": TOPIC_TO_STAGE[topic], "qtype": qtype, "stem": stem,
        "options": None, "correct_index": None, "explanation": "", "error_type": LEGACY_ERROR,
        "error_detail": None, "option_errors": None, "source": "legacy", "source_ref": qid[2:],
        "reviewed": False, "red_line": False, "shuffle": True,
    }
    q.update(kw)
    return q


def legacy_mcq(rows):
    out = []
    for r in rows:
        stem, _, tail = r["題目"].partition("\n\n")
        options = re.findall(r"^[ABC]\. (.*)$", r["題目"], re.M)
        scene = r["題目"].split("\n", 1)[1].split("\n\n")[0]
        out.append(_legacy("L-" + r["題號"], r["主題"], "mcq", scene + "\n\n以下哪一個回覆最適合？",
                           options=options, correct_index="ABC".index(r["正確答案"]),
                           explanation=r["解析"], error_detail=r["關鍵失誤"],
                           shuffle=False))  # 解析引用 A/B/C，選項順序必須固定
    return out


def _rubric(score_text, reference):
    m = re.search(r"2分：答出「(.*?)」", score_text)
    return [m.group(1)] if m else [reference]


def legacy_short(rows_short, rows_multi):
    out = []
    for r in rows_short:
        question = r["題目"].split("\n\n")[-1]
        out.append(_legacy("L-" + r["題號"], r["主題"], "short", f"{r['生活情境']}\n\n{question}",
                           reference_answer=r["參考答案"], rubric=_rubric(r["得分點"], r["參考答案"]),
                           key_error=r["關鍵失誤"], error_detail=r["關鍵失誤"],
                           explanation=r["參考答案"]))
    for r in rows_multi:
        m = re.search(r"【第一輪】(.*?)\n你的回覆：「(.*?)」\n\n【第二輪】顧客接著說：「(.*?)」", r["題目"], re.S)
        stem = (f"【第一輪】{m[1]}\n你先前的回覆：「{m[2]}」\n\n【第二輪】顧客接著說：「{m[3]}」\n"
                "請寫出你的第二輪回覆。")
        out.append(_legacy("L-" + r["題號"], r["主題"], "short", stem, reference_answer=r["參考答案"],
                           rubric=[r["參考答案"]], key_error=r["關鍵失誤"], error_detail=r["關鍵失誤"],
                           explanation=r["參考答案"]))
    return out


# ---------- 舊案例依總表改寫（「總表延伸」） ----------
CASE_ABILITY = {"查核": "check", "判斷": "boundary", "回覆": "reply", "處理": "next", "升級": "escalate"}


def load_case_map(data_dir=None):
    """讀 tools/data/case_map_*.json：案例編號 → {rules, check, boundary, reply, next, escalate, mcq}。"""
    import json
    d = Path(data_dir) if data_dir else Path(__file__).resolve().parent / "data"
    out = {}
    for f in sorted(d.glob("case_map_*.json")):
        out.update(json.loads(f.read_text(encoding="utf-8")))
    return out


def _ext(qid, stage, qtype, stem, cid, ids, error_type, red, **kw):
    q = {
        "id": qid, "stage": stage, "qtype": qtype, "stem": stem, "options": None, "correct_index": None,
        "explanation": "", "error_type": error_type, "error_detail": None, "option_errors": None,
        "source": "rules_ext", "source_ref": f"{cid}:{'+'.join(ids)}", "reviewed": False, "red_line": red,
        "shuffle": True,
    }
    q.update(kw)
    return q


def fused_questions(rules, short_rows, mcq_rows, multi_rows, case_map):
    """已對應到總表規則的案例：保留舊情境，答案與得分點改用總表規則寫成。"""
    rule = {r["編號"]: (clean(r["最新版規則"]), r["紅線"] == "★") for r in rules if r["狀態"] == "現行"}
    out = []
    for cid in sorted(case_map):
        e = case_map[cid]
        ids = e["rules"]
        label = "、".join(ids)
        red = any(rule[i][1] for i in ids)
        etype = "違反紅線" if red else LEGACY_ERROR
        stage = stage_of(ids[0])
        for row in (r for r in short_rows if r["案例編號"] == cid):
            ref = e[CASE_ABILITY[row["能力面向"]]]
            out.append(_ext("L-" + row["題號"], stage, "short", f"{row['生活情境']}\n\n{row['題目'].split(chr(10) * 2)[-1]}",
                            cid, ids, etype, red, reference_answer=ref,
                            rubric=[x.strip() for x in ref.split("；") if x.strip()],
                            key_error=row["關鍵失誤"], error_detail=row["關鍵失誤"],
                            explanation=f"{ref}（對應總表規則 {label}）"))
        for row in (r for r in mcq_rows if r["案例編號"] == cid):
            opts = re.findall(r"^[ABC]\. (.*)$", row["題目"], re.M)
            ci = "ABC".index(row["正確答案"])
            opts[ci] = e["mcq"]
            scene = row["題目"].split("\n", 1)[1].split("\n\n")[0]
            out.append(_ext("L-" + row["題號"], stage, "mcq", scene + "\n\n以下哪一個回覆最適合？", cid, ids, etype, red,
                            options=opts, correct_index=ci, error_detail=row["關鍵失誤"],
                            explanation=f"對應總表規則 {label}：{rule[ids[0]][0].rstrip('。')}。判斷重點：{e['boundary']}"))
        for row in (r for r in multi_rows if r["案例編號"] == cid):
            m = re.search(r"【第一輪】(.*?)\n你的回覆：「(.*?)」\n\n【第二輪】顧客接著說：「(.*?)」", row["題目"], re.S)
            stem = (f"【第一輪】{m[1]}\n你先前的回覆：「{e['mcq']}」\n\n【第二輪】顧客接著說：「{m[3]}」\n"
                    "請寫出你的第二輪回覆。")
            out.append(_ext("L-" + row["題號"], stage, "short", stem, cid, ids, etype, red,
                            reference_answer=f"{e['reply']}；{e['boundary']}", rubric=[e["reply"], e["boundary"]],
                            key_error=row["關鍵失誤"], error_detail=row["關鍵失誤"],
                            explanation=f"{e['reply']}；{e['boundary']}（對應總表規則 {label}）"))
    return out


def all_case_questions(rules, short_rows, mcq_rows, multi_rows, case_map):
    """700 題：有對應總表規則的案例走「總表延伸」，其餘維持原本通用內容（未審核）。"""
    mapped = set(case_map)
    rest = lambda rows: [r for r in rows if r["案例編號"] not in mapped]  # noqa: E731
    return (fused_questions(rules, short_rows, mcq_rows, multi_rows, case_map)
            + legacy_mcq(rest(mcq_rows)) + legacy_short(rest(short_rows), rest(multi_rows)))


def main(out_path):
    import csv
    import json
    from pathlib import Path
    from xlsx_reader import read_sheet

    root = Path(__file__).resolve().parents[2]
    xlsx = str(root / "統整結果_標準答案總表.xlsx")

    def rd(name):
        with (root / "AI專屬客服測驗" / name).open(encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))

    rules = read_sheet(xlsx, "規則總表")
    qs = (rule_questions(rules) + redline_questions(rules)
          + conflict_questions(read_sheet(xlsx, "新人問答測試"))
          + rumor_questions(read_sheet(xlsx, "傳言（不採用）"))
          + tip_questions(read_sheet(xlsx, "經驗談"))
          + all_case_questions(rules, rd("電商客服_生活化情境500題_含得分點.csv"), rd("電商客服_最佳回覆選擇題100.csv"),
                               rd("電商客服_多輪追問題100.csv"), load_case_map()))
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(qs, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
    return len(qs)


if __name__ == "__main__":
    import sys
    print(main(sys.argv[1]), "questions")
