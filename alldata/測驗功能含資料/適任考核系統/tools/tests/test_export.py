import csv, json, sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import export_questions as ex  # noqa: E402
import build_questions as bq  # noqa: E402


def mcq(**kw):
    q = {"id": "R-7-9", "stage": 7, "qtype": "mcq", "stem": "題幹", "options": ["甲", "乙", "丙"], "correct_index": 1,
         "explanation": "解析文字", "error_type": "用了舊規則", "error_detail": None, "option_errors": [None, None, None],
         "source": "rules", "source_ref": "7-9", "reviewed": True, "red_line": True, "shuffle": True}
    q.update(kw)
    return q


def read(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


class ExportTest(unittest.TestCase):
    def export(self, qs):
        d = tempfile.mkdtemp()
        out = Path(d) / "q.csv"
        n = ex.export_csv(qs, str(out))
        return n, out

    def test_writes_utf8_bom_so_excel_reads_chinese(self):
        _, out = self.export([mcq()])
        self.assertEqual(out.read_bytes()[:3], b"\xef\xbb\xbf")

    def test_mcq_row_has_letter_and_text_of_correct_answer(self):
        n, out = self.export([mcq()])
        r = read(out)[0]
        self.assertEqual(n, 1)
        self.assertEqual((r["題號"], r["階段"], r["題型"]), ("R-7-9", "第 7 章 退換貨與退款", "選擇題"))
        self.assertEqual((r["選項A"], r["選項B"], r["選項C"], r["選項D"]), ("甲", "乙", "丙", ""))
        self.assertEqual((r["正確答案"], r["正確答案內容"]), ("B", "乙"))
        self.assertEqual(r["解析"], "解析文字")
        self.assertEqual((r["紅線題"], r["審核狀態"], r["來源"]), ("是", "已審核", "總表規則"))

    def test_tf_question_type_and_answer(self):
        r = read(self.export([mcq(qtype="tf", options=["是", "否"], correct_index=0)])[1])[0]
        self.assertEqual((r["題型"], r["正確答案"], r["正確答案內容"]), ("是非題", "A", "是"))

    def test_short_question_has_reference_answer_and_rubric(self):
        q = mcq(id="L-L001", qtype="short", options=None, correct_index=None, reference_answer="參考",
                rubric=["點一", "點二"], source="legacy", reviewed=False, red_line=False)
        r = read(self.export([q])[1])[0]
        self.assertEqual(r["題型"], "情境簡答")
        self.assertEqual((r["正確答案"], r["參考答案"], r["得分點"]), ("", "參考", "點一 ／ 點二"))
        self.assertEqual((r["審核狀態"], r["來源"], r["紅線題"]), ("待主管審核", "舊題庫（通用內容，未對應總表）", ""))

    def test_extended_source_has_its_own_label(self):
        r = read(self.export([mcq(source="rules_ext", source_ref="C001:2-2", reviewed=False)])[1])[0]
        self.assertEqual((r["來源"], r["來源編號"]), ("總表延伸（舊案例依總表改寫）", "C001:2-2"))

    def test_special_stage_names(self):
        self.assertEqual(ex.stage_name(0), "綜合適任考核")
        self.assertEqual(ex.stage_name(1), "第 1 章 基本規定（工單、檔案、服務時間）")

    def test_sorted_by_stage_then_id_and_commas_quotes_survive(self):
        qs = [mcq(id="B", stage=3, stem='含,逗號與"引號"'), mcq(id="A", stage=3), mcq(id="C", stage=1)]
        rows = read(self.export(qs)[1])
        self.assertEqual([r["題號"] for r in rows], ["C", "A", "B"])
        self.assertEqual(rows[2]["題幹"], '含,逗號與"引號"')

    def test_real_bank_exports_every_question(self):
        # 用真實題庫產生器跑一遍：筆數必須等於題庫總數、每題都有正確答案或參考答案
        d = Path(tempfile.mkdtemp())
        bq.main(str(d / "questions.json"))
        qs = json.loads((d / "questions.json").read_text(encoding="utf-8"))
        n, out = self.export(qs)
        rows = read(out)
        self.assertEqual((n, len(rows)), (len(qs), len(qs)))
        for r in rows:
            self.assertTrue(r["正確答案內容"] or r["參考答案"], r["題號"])
            self.assertTrue(r["題幹"], r["題號"])


if __name__ == "__main__":
    unittest.main()
