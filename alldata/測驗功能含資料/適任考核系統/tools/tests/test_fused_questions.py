import csv, re, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from xlsx_reader import read_sheet  # noqa: E402
import build_questions as bq  # noqa: E402

OLD = ROOT / "AI專屬客服測驗"
RULES = read_sheet(str(ROOT / "統整結果_標準答案總表.xlsx"), "規則總表")
RULE_BY_ID = {r["編號"]: r for r in RULES if r["狀態"] == "現行"}


def rd(name):
    with (OLD / name).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


SHORT = rd("電商客服_生活化情境500題_含得分點.csv")
MCQ = rd("電商客服_最佳回覆選擇題100.csv")
MULTI = rd("電商客服_多輪追問題100.csv")
CASE_MAP = bq.load_case_map()
FIELDS = ["check", "boundary", "reply", "next", "escalate", "mcq"]
ABILITY = {"查核": "check", "判斷": "boundary", "回覆": "reply", "處理": "next", "升級": "escalate"}


def build():
    return bq.all_case_questions(RULES, SHORT, MCQ, MULTI, CASE_MAP)


class CaseMapTest(unittest.TestCase):
    def test_has_64_mapped_cases_with_all_fields(self):
        self.assertEqual(len(CASE_MAP), 64)
        for cid, e in CASE_MAP.items():
            self.assertRegex(cid, r"^C\d{3}$")
            self.assertTrue(e["rules"], cid)
            for f in FIELDS:
                self.assertGreaterEqual(len(e[f].strip()), 8, (cid, f))

    def test_every_mapped_rule_exists_and_is_current(self):
        for cid, e in CASE_MAP.items():
            for rid in e["rules"]:
                self.assertIn(rid, RULE_BY_ID, (cid, rid))

    def test_no_annotation_marks_and_no_generic_filler(self):
        for cid, e in CASE_MAP.items():
            for f in FIELDS:
                self.assertNotIn("〔", e[f], (cid, f))
                self.assertNotRegex(e[f], r"依.{0,4}SOP 建立", (cid, f))

    def test_correct_reply_is_not_one_of_the_legacy_wrong_options(self):
        legacy_mcq = {r["案例編號"]: r for r in MCQ}
        for cid, e in CASE_MAP.items():
            opts = re.findall(r"^[ABC]\. (.*)$", legacy_mcq[cid]["題目"], re.M)
            wrong = [o for i, o in enumerate(opts) if "ABC"[i] != legacy_mcq[cid]["正確答案"]]
            self.assertNotIn(e["mcq"], wrong, cid)


class AllCaseQuestionsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.qs = build()
        cls.by_id = {q["id"]: q for q in cls.qs}

    def test_seven_hundred_unique_questions(self):
        self.assertEqual(len(self.qs), 700)
        self.assertEqual(len(self.by_id), 700)
        self.assertEqual(sum(q["qtype"] == "short" for q in self.qs), 600)
        self.assertEqual(sum(q["qtype"] == "mcq" for q in self.qs), 100)

    def test_mapped_cases_become_rules_ext_and_the_rest_stay_legacy(self):
        mapped = {q["source_ref"].split(":")[0] for q in self.qs if q["source"] == "rules_ext"}
        self.assertEqual(mapped, set(CASE_MAP))
        self.assertEqual(sum(q["source"] == "rules_ext" for q in self.qs), 64 * 7)
        self.assertEqual(sum(q["source"] == "legacy" for q in self.qs), 36 * 7)
        for q in self.qs:
            self.assertFalse(q["reviewed"], q["id"])

    def test_stage_of_fused_question_follows_the_first_mapped_rule(self):
        self.assertEqual(self.by_id["L-L001"]["stage"], 2)    # C001 → 2-2
        self.assertEqual(self.by_id["L-M051"]["stage"], 7)    # C051 → 7-1
        self.assertEqual(self.by_id["L-D006"]["stage"], 1)    # C006 → 1-1

    def test_short_answer_uses_the_mapped_field_for_that_ability(self):
        for row in SHORT:
            cid = row["案例編號"]
            if cid not in CASE_MAP:
                continue
            q = self.by_id["L-" + row["題號"]]
            want = CASE_MAP[cid][ABILITY[row["能力面向"]]]
            self.assertEqual(q["reference_answer"], want, q["id"])
            self.assertEqual(q["rubric"], [p.strip() for p in want.split("；") if p.strip()], q["id"])
            self.assertTrue(q["stem"].startswith(row["生活情境"]), q["id"])
            self.assertIn(row["題目"].split("\n\n")[-1], q["stem"], q["id"])

    def test_mcq_puts_the_new_correct_reply_at_the_legacy_correct_position(self):
        for row in MCQ:
            cid = row["案例編號"]
            q = self.by_id["L-" + row["題號"]]
            self.assertEqual(q["qtype"], "mcq")
            self.assertEqual(len(q["options"]), 3)
            self.assertEqual(q["correct_index"], "ABC".index(row["正確答案"]))
            if cid in CASE_MAP:
                self.assertEqual(q["options"][q["correct_index"]], CASE_MAP[cid]["mcq"], q["id"])
                legacy = re.findall(r"^[ABC]\. (.*)$", row["題目"], re.M)
                for i in range(3):
                    if i != q["correct_index"]:
                        self.assertEqual(q["options"][i], legacy[i], q["id"])
                self.assertNotRegex(q["explanation"], r"(^|\s)[ABC] (正確|錯誤)", q["id"])
                self.assertIn("對應總表規則", q["explanation"], q["id"])
                self.assertTrue(q["shuffle"], q["id"])

    def test_multi_turn_question_uses_the_new_reply_and_keeps_the_followup(self):
        row = next(r for r in MULTI if r["案例編號"] == "C001")
        q = self.by_id["L-" + row["題號"]]
        follow = re.search(r"顧客接著說：「(.*?)」", row["題目"], re.S)[1]
        self.assertEqual(q["qtype"], "short")
        self.assertIn(CASE_MAP["C001"]["mcq"], q["stem"])
        self.assertIn(follow, q["stem"])
        self.assertIn(CASE_MAP["C001"]["boundary"], q["reference_answer"])
        self.assertEqual(len(q["rubric"]), 2)

    def test_error_type_marks_red_line_rules(self):
        self.assertEqual(self.by_id["L-L001"]["error_type"], "違反紅線")    # 2-2 ★
        self.assertTrue(self.by_id["L-L001"]["red_line"])
        self.assertEqual(self.by_id["L-L031"]["error_type"], "違反紅線")    # C007 → 2-2 ★
        # C006 → 1-1（非紅線）
        self.assertEqual(self.by_id["L-L026"]["error_type"], "情境判斷失誤")
        self.assertFalse(self.by_id["L-L026"]["red_line"])

    def test_explanations_have_no_doubled_punctuation(self):
        for q in self.qs:
            self.assertNotIn("。。", q["explanation"], q["id"])
            self.assertNotIn("；；", q["explanation"], q["id"])

    def test_no_annotation_marks_in_any_question(self):
        for q in self.qs:
            self.assertNotIn("〔", q["stem"], q["id"])
            for o in q.get("options") or []:
                self.assertNotIn("〔", o, q["id"])


if __name__ == "__main__":
    unittest.main()
