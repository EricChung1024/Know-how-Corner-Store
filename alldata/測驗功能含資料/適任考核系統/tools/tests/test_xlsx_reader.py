import sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from xlsx_reader import read_sheet  # noqa: E402

XLSX = str(ROOT / "統整結果_標準答案總表.xlsx")


class ReadSheetTest(unittest.TestCase):
    def test_rules_sheet_has_59_rows(self):
        rows = read_sheet(XLSX, "規則總表")
        self.assertEqual(len(rows), 59)
        self.assertEqual(rows[0]["編號"], "1-1")
        self.assertEqual(rows[0]["代碼"], "G06")

    def test_empty_cells_are_empty_strings(self):
        rows = read_sheet(XLSX, "規則總表")
        self.assertEqual(rows[0]["紅線"], "")

    def test_missing_sheet_raises(self):
        with self.assertRaises(KeyError):
            read_sheet(XLSX, "不存在的工作表")


if __name__ == "__main__":
    unittest.main()
