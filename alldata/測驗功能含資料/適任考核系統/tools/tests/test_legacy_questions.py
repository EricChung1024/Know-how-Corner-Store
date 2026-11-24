import csv, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_questions as bq  # noqa: E402

OLD = ROOT / "AI專屬客服測驗"


def rd(name):
    with (OLD / name).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


MCQ = rd("電商客服_最佳回覆選擇題100.csv")
SHORT = rd("電商客服_生活化情境500題_含得分點.csv")
MULTI = rd("電商客服_多輪追問題100.csv")


class LegacyTest(unittest.TestCase):
    def test_legacy_mcq_count_and_correct_index(self):
        qs = {q["id"]: q for q in bq.legacy_mcq(MCQ)}
        self.assertEqual(len(qs), 100)
        q = qs["L-M001"]
        self.assertEqual(q["qtype"], "mcq")
        self.assertEqual(len(q["options"]), 3)
        self.assertEqual(q["correct_index"], 0)
        self.assertEqual(q["error_type"], "情境判斷失誤")
        self.assertIn("僅憑姓名", q["error_detail"])
        self.assertNotIn("A.", q["stem"].split("\n")[-1])

    def test_short_merges_scenario_and_multiturn(self):
        qs = {q["id"]: q for q in bq.legacy_short(SHORT, MULTI)}
        self.assertEqual(len(qs), 600)
        d = qs["L-D001"]
        self.assertEqual(d["qtype"], "short")
        self.assertIn("週五晚上 9 點", d["stem"])
        self.assertIn("我只是問一下而已", d["stem"])
        self.assertIn("為保護您的資料", d["stem"])
        s = qs["L-L001"]
        self.assertIn("回覆之前，你會先查哪些資料？", s["stem"])
        self.assertIn("週五晚上 9 點", s["stem"])

    def test_rubric_nonempty_and_strips_score_prefix(self):
        qs = bq.legacy_short(SHORT, MULTI)
        for q in qs:
            self.assertGreaterEqual(len(q["rubric"]), 1, q["id"])
            self.assertTrue(q["reference_answer"], q["id"])
            self.assertIsNone(q["options"])
        s = {q["id"]: q for q in qs}["L-L004"]
        self.assertEqual(s["rubric"], ["按核身流程請對方提供必要資料"])

    def test_legacy_mcq_is_not_shuffled_because_explanations_cite_letters(self):
        for q in bq.legacy_mcq(MCQ):
            self.assertIs(q["shuffle"], False, q["id"])
        for q in bq.legacy_short(SHORT, MULTI):
            self.assertIs(q["shuffle"], True, q["id"])

    def test_all_topics_mapped(self):
        topics = {r["主題"] for r in MCQ + SHORT + MULTI}
        self.assertEqual(len(topics), 20)
        for t in topics:
            self.assertIn(bq.TOPIC_TO_STAGE[t], range(1, 10))

    def test_unknown_topic_raises(self):
        bad = [dict(MCQ[0], 主題="不存在的主題")]
        with self.assertRaises(KeyError):
            bq.legacy_mcq(bad)

    def test_all_legacy_unreviewed(self):
        for q in bq.legacy_mcq(MCQ) + bq.legacy_short(SHORT, MULTI):
            self.assertEqual(q["source"], "legacy")
            self.assertFalse(q["reviewed"])
            self.assertFalse(q["red_line"])

    def test_main_writes_all_questions(self):
        import json, tempfile
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "q.json"
            bq.main(str(out))
            data = json.loads(out.read_text(encoding="utf-8"))
        ids = [q["id"] for q in data]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(sum(1 for q in data if q["source"] in ("legacy", "rules_ext")), 700)
        self.assertEqual(sum(1 for q in data if q["source"] == "rules_ext"), 448)
        self.assertGreaterEqual(sum(1 for q in data if q["source"] == "rules"), 82)  # 57+12+2+11 起跳


if __name__ == "__main__":
    unittest.main()
