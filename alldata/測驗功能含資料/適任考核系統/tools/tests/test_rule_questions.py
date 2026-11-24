import sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from xlsx_reader import read_sheet  # noqa: E402
import build_questions as bq  # noqa: E402

XLSX = str(ROOT / "統整結果_標準答案總表.xlsx")
RULES = read_sheet(XLSX, "規則總表")
QA = read_sheet(XLSX, "新人問答測試")
RUMOR = read_sheet(XLSX, "傳言（不採用）")
TIPS = read_sheet(XLSX, "經驗談")


def by_id(qs):
    return {q["id"]: q for q in qs}


class RuleQuestionsTest(unittest.TestCase):
    def test_stage_of(self):
        self.assertEqual(bq.stage_of("7-9"), 7)
        self.assertEqual(bq.stage_of("—雙 11 大促 LINE 首回放寬（暫時規則）"), None)

    def test_current_rules_only_and_never_expired_as_correct(self):
        qs = bq.rule_questions(RULES)
        ids = by_id(qs)
        current = [r for r in RULES if r["狀態"] == "現行"]
        expired = [r for r in RULES if r["狀態"] != "現行"]
        self.assertEqual(len(qs), len(current))
        self.assertEqual(len(current), 57)
        for r in current:
            self.assertIn("R-" + r["編號"], ids)
        for q in qs:
            correct = q["options"][q["correct_index"]]
            for r in expired:
                self.assertNotEqual(correct, r["最新版規則"])

    def test_correct_option_is_latest_text(self):
        q = by_id(bq.rule_questions(RULES))["R-7-9"]
        self.assertIn("3 個工作日", q["options"][q["correct_index"]])
        self.assertGreaterEqual(len(q["options"]), 2)
        self.assertEqual(len(set(q["options"])), len(q["options"]))
        self.assertEqual(len(q["option_errors"]), len(q["options"]))
        self.assertIsNone(q["option_errors"][q["correct_index"]])
        self.assertTrue(all(e for i, e in enumerate(q["option_errors"]) if i != q["correct_index"]))

    def test_rule_without_old_versions_becomes_tf(self):
        qs = bq.rule_questions(RULES)
        tf = [q for q in qs if q["qtype"] == "tf"]
        self.assertEqual(len(tf), 2)
        for q in tf:
            self.assertEqual(q["options"], ["是", "否"])
            self.assertEqual(q["correct_index"], 0)

    def test_shuffle_is_deterministic(self):
        a = bq.rule_questions(RULES)
        b = bq.rule_questions(RULES)
        self.assertEqual(a, b)

    def test_redline_count(self):
        qs = bq.redline_questions(RULES)
        self.assertEqual(len(qs), 12)
        for q in qs:
            self.assertTrue(q["red_line"])
            self.assertEqual(q["error_type"], "違反紅線")
            self.assertEqual(q["qtype"], "tf")

    def test_conflict_questions_skip_unconfirmed(self):
        ids = by_id(bq.conflict_questions(QA))
        self.assertIn("QA-Q01", ids)
        self.assertNotIn("QA-Q02", ids)
        self.assertNotIn("QA-Q05", ids)
        self.assertEqual(ids["QA-Q01"]["error_type"], "被舊資訊誤導")
        self.assertEqual(ids["QA-Q01"]["stage"], 7)

    def test_rule_questions_are_shuffled(self):
        for q in bq.rule_questions(RULES) + bq.conflict_questions(QA) + bq.tip_questions(TIPS):
            self.assertIs(q["shuffle"], True, q["id"])

    def test_no_placeholder_options_anywhere(self):
        allq = (bq.rule_questions(RULES) + bq.redline_questions(RULES) + bq.conflict_questions(QA)
                + bq.rumor_questions(RUMOR) + bq.tip_questions(TIPS))
        for q in [x for x in allq if x["qtype"] == "mcq"]:
            for opt in q["options"]:
                body = opt.split("：", 1)[-1].strip()
                self.assertGreaterEqual(len(body), 2, (q["id"], opt))
                self.assertNotIn(body, {"—", "-", "無", "無。"}, (q["id"], opt))

    def test_no_editorial_annotations_leak_into_stems_or_options(self):
        # 總表舊版欄位帶有〔…〕編輯註記（例：〔與法規不符〕），會直接洩漏哪個選項是錯的
        allq = (bq.rule_questions(RULES) + bq.redline_questions(RULES) + bq.conflict_questions(QA)
                + bq.rumor_questions(RUMOR) + bq.tip_questions(TIPS))
        for q in allq:
            self.assertNotIn("〔", q["stem"], q["id"])
            for opt in q["options"]:
                self.assertNotIn("〔", opt, (q["id"], opt))
                self.assertNotIn("〕", opt, (q["id"], opt))

    def test_cleaning_keeps_options_distinct_and_nonempty(self):
        for q in bq.rule_questions(RULES) + bq.redline_questions(RULES):
            self.assertEqual(len(set(q["options"])), len(q["options"]), q["id"])
            self.assertTrue(all(o.strip() for o in q["options"]), q["id"])

    def test_rumor_is_tf_and_answer_not_adoptable(self):
        qs = bq.rumor_questions(RUMOR)
        self.assertEqual(len(qs), 2)
        for q in qs:
            self.assertEqual(q["qtype"], "tf")
            self.assertTrue(q["options"][q["correct_index"]].startswith("不可以"))
            self.assertEqual(q["error_type"], "把傳言當規定")

    def test_tip_questions(self):
        qs = bq.tip_questions(TIPS)
        self.assertEqual(len(qs), 11)  # X12「所有客人」不出題
        for q in qs:
            self.assertEqual(len(set(q["options"])), 3)
            self.assertEqual(q["error_type"], "應對方式不當")

    def test_every_question_has_stage_1_to_9_and_is_reviewed(self):
        allq = (bq.rule_questions(RULES) + bq.redline_questions(RULES) + bq.conflict_questions(QA)
                + bq.rumor_questions(RUMOR) + bq.tip_questions(TIPS))
        self.assertEqual(len({q["id"] for q in allq}), len(allq))
        for q in allq:
            self.assertIn(q["stage"], range(1, 10), q["id"])
            self.assertTrue(q["reviewed"])
            self.assertEqual(q["source"], "rules")


if __name__ == "__main__":
    unittest.main()
