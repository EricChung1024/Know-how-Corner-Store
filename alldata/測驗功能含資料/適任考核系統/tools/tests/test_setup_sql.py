import sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_setup_sql as bs  # noqa: E402


class SetupSqlTest(unittest.TestCase):
    def test_contains_all_migrations_in_order(self):
        sql = bs.build(str(ROOT / "supabase"))
        marks = ["create table profiles", "enable row level security", "create function start_exam",
                 "create function list_wrong", "create function set_hire_date"]
        pos = [sql.index(m) for m in marks]
        self.assertEqual(pos, sorted(pos))

    def test_has_no_questions_data_and_no_test_helpers(self):
        sql = bs.build(str(ROOT / "supabase"))
        self.assertNotIn("insert into questions", sql)
        self.assertNotIn("t_as(", sql)

    def test_committed_setup_sql_is_up_to_date(self):
        self.assertEqual((ROOT / "supabase" / "setup.sql").read_text(encoding="utf-8"), bs.build(str(ROOT / "supabase")))


if __name__ == "__main__":
    unittest.main()
