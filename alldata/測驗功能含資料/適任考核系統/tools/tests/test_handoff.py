import csv, json, sys, tempfile, unittest, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from xlsx_reader import read_rows, sheet_names  # noqa: E402
import build_questions as bq  # noqa: E402
import export_handoff as eh  # noqa: E402

XLSX = str(ROOT / "統整結果_標準答案總表.xlsx")


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.reader(f))


class RawRowsTest(unittest.TestCase):
    def test_read_rows_keeps_every_row_including_note_rows(self):
        rows = read_rows(XLSX, "經驗談")
        self.assertEqual(rows[0], ["代碼", "客人類型", "怎麼應對", "出自", "相關編號"])
        self.assertEqual(len(rows), 13)
        self.assertEqual(len(read_rows(XLSX, "規則總表")), 60)

    def test_sheet_names_lists_all_eight(self):
        self.assertEqual(len(sheet_names(XLSX)), 8)
        self.assertIn("規則總表", sheet_names(XLSX))


class BuildPackageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name) / "pkg"
        d = Path(cls.tmp.name) / "q.json"
        bq.main(str(d))
        cls.info = eh.build_package(str(cls.out), questions_json=str(d), xlsx_path=XLSX,
                                    db_snapshot=str(TOOLS / "out" / "db_snapshot.json"),
                                    setup_sql=str(ROOT / "適任考核系統" / "supabase" / "setup.sql"))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_expected_files_exist(self):
        for rel in ["00_請先讀我.md", "data/題庫_全部.csv", "data/題庫_全部.json", "data/案例對照_題目到總表規則.csv",
                    "data/db_snapshot.json", "schema/setup.sql"]:
            self.assertTrue((self.out / rel).is_file(), rel)
        self.assertEqual(len(list((self.out / "data" / "總表").glob("*.csv"))), 8)

    def test_question_exports_have_every_question(self):
        rows = read_csv(self.out / "data" / "題庫_全部.csv")
        self.assertEqual(len(rows) - 1, 785)
        data = json.loads((self.out / "data" / "題庫_全部.json").read_text(encoding="utf-8"))
        self.assertEqual(len(data), 785)
        self.assertIn("correct_index", data[0])

    def test_case_map_csv_has_100_cases_with_fused_and_kept_labels(self):
        rows = read_csv(self.out / "data" / "案例對照_題目到總表規則.csv")
        head, body = rows[0], rows[1:]
        self.assertEqual(len(body), 100)
        status = [r[head.index("處理方式")] for r in body]
        self.assertEqual(status.count("總表延伸"), 64)
        self.assertEqual(status.count("維持原通用內容（總表無對應規則）"), 36)
        self.assertTrue(all(r[head.index("對應總表規則")] for r in body if r[head.index("處理方式")] == "總表延伸"))

    def test_readme_states_the_real_numbers_and_caveats(self):
        text = (self.out / "00_請先讀我.md").read_text(encoding="utf-8")
        for needle in ["785", "448", "252", "85", "AISOP-exam", "pdfdyuahpshrrdwkvyyh", "submit_selfcheck", "違反紅線"]:
            self.assertIn(needle, text, needle)
        self.assertNotIn("service_role", text)
        self.assertNotIn("sb_secret_", text)

    def test_zip_contains_the_whole_package(self):
        z = Path(self.tmp.name) / "pkg.zip"
        eh.make_zip(str(self.out), str(z))
        with zipfile.ZipFile(z) as zf:
            names = zf.namelist()
        self.assertIn("評分系統資料包/00_請先讀我.md", names)
        self.assertIn("評分系統資料包/data/題庫_全部.csv", names)


if __name__ == "__main__":
    unittest.main()
