import re, sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gen_seed_sql as g  # noqa: E402


def q(**kw):
    base = {"id": "X-1", "stage": 2, "qtype": "mcq", "stem": "題幹", "options": ["a", "b"], "correct_index": 0,
            "explanation": "解析", "error_type": "用了舊規則", "error_detail": None, "option_errors": [None, "2022 手冊"],
            "source": "rules", "source_ref": "2-2", "reviewed": True, "red_line": False}
    base.update(kw)
    return base


def unquote(lit):
    m = re.fullmatch(r"(\$[a-z0-9_]*\$)(.*)\1", lit, re.S)
    return m.group(2)


class SeedSqlTest(unittest.TestCase):
    def test_dollar_quote_roundtrip_with_quote_and_tag(self):
        for s in ["含單引號 ' 的字", "含 $q$ 標記 $q$ 的字", "含 $q$ 和 $q2$ 兩種", "普通"]:
            lit = g.dq(s)
            self.assertEqual(unquote(lit), s)
            self.assertNotIn("'", lit.split(s)[0])  # 定界符本身不含單引號

    def test_null_and_bool_and_int(self):
        sql = g.to_sql([q(error_detail=None, red_line=True)])
        self.assertIn("null", sql)
        self.assertIn("true", sql)

    def test_shuffle_defaults_to_true_and_respects_false(self):
        default = g.to_sql([q()]).split("values")[1].split("on conflict")[0]
        fixed = g.to_sql([q(shuffle=False)]).split("values")[1].split("on conflict")[0]
        self.assertEqual(fixed.count("false"), default.count("false") + 1)
        self.assertIn("shuffle = excluded.shuffle", g.to_sql([q()]))

    def test_idempotent_on_conflict(self):
        self.assertIn("on conflict (id) do update", g.to_sql([q()]))

    def test_statement_count_equals_question_count(self):
        qs = [q(id=f"X-{i}") for i in range(7)]
        self.assertEqual(g.to_sql(qs).count("insert into questions"), 7)

    def test_short_question_has_rubric_jsonb(self):
        sql = g.to_sql([q(id="S-1", qtype="short", options=None, correct_index=None, option_errors=None,
                          reference_answer="REF", rubric=["點一"], key_error="漏")])
        self.assertIn('["點一"]', sql)
        self.assertIn("::jsonb", sql)

    def test_written_file_keeps_newlines_inside_strings_as_lf(self):
        # Windows 上 write_text 會把題幹裡的換行變成 CR+LF，匯入資料庫後題幹就帶 CR
        import json, tempfile
        with tempfile.TemporaryDirectory() as d:
            src, dst = Path(d) / "q.json", Path(d) / "seed.sql"
            src.write_text(json.dumps([q(stem="第一行\n第二行")], ensure_ascii=False), encoding="utf-8")
            g.main(str(src), str(dst))
            self.assertNotIn(b"\r", dst.read_bytes())

    def test_main_writes_file(self):
        import json, tempfile
        with tempfile.TemporaryDirectory() as d:
            src, dst = Path(d) / "q.json", Path(d) / "seed.sql"
            src.write_text(json.dumps([q(), q(id="X-2")], ensure_ascii=False), encoding="utf-8")
            n = g.main(str(src), str(dst))
            self.assertEqual(n, 2)
            self.assertEqual(dst.read_text(encoding="utf-8").count("insert into questions"), 2)


if __name__ == "__main__":
    unittest.main()
