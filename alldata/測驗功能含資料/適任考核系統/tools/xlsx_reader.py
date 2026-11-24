"""讀取總表 xlsx（只用標準庫）。總表使用 inline string，沒有 sharedStrings。"""
import re
import zipfile
from xml.etree import ElementTree as ET

_M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def _col_index(ref: str) -> int:
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def sheet_names(path: str) -> list:
    """依工作簿順序回傳所有工作表名稱。"""
    with zipfile.ZipFile(path) as z:
        wb = ET.fromstring(z.read("xl/workbook.xml"))
    return [s.get("name") for s in wb.iter(_M + "sheet")]


def _sheet_path(z: zipfile.ZipFile, sheet_name: str) -> str:
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rid = None
    for s in wb.iter(_M + "sheet"):
        if s.get("name") == sheet_name:
            rid = s.get(_R + "id")
    if rid is None:
        raise KeyError(sheet_name)
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    for rel in rels:
        if rel.get("Id") == rid:
            target = rel.get("Target").lstrip("/")
            return target if target.startswith("xl/") else "xl/" + target
    raise KeyError(sheet_name)


def read_rows(path: str, sheet_name: str) -> list:
    """回傳工作表的每一列（list[str]），不假設標題列；空儲存格為空字串。"""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read(_sheet_path(z, sheet_name)))
    table = []
    for row in root.iter(_M + "row"):
        cells = {}
        for c in row.findall(_M + "c"):
            v = c.find(_M + "v")
            text = "".join(t.text or "" for t in c.iter(_M + "t"))
            cells[_col_index(c.get("r"))] = text or (v.text if v is not None else "") or ""
        width = max(cells) + 1 if cells else 0
        table.append([cells.get(i, "") for i in range(width)])
    return table


def read_sheet(path: str, sheet_name: str) -> list:
    """第 1 列為欄名，回傳其後每列的 dict；空儲存格為空字串。"""
    table = read_rows(path, sheet_name)
    header, body = table[0], table[1:]
    return [{h: (r[i] if i < len(r) else "") for i, h in enumerate(header)} for r in body]
