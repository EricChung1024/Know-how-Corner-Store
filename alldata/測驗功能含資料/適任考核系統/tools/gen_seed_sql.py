"""questions.json → supabase/seed.sql（可重複執行；含答案，不得放進 site/）。"""
import json
from pathlib import Path

COLS = ["id", "stage", "qtype", "stem", "options", "correct_index", "explanation", "error_type", "error_detail",
        "option_errors", "reference_answer", "rubric", "key_error", "source", "source_ref", "reviewed", "red_line", "shuffle"]
JSON_COLS = {"options", "option_errors", "rubric"}


def dq(s: str) -> str:
    """dollar-quote 字串；挑一個不會出現在內容裡的標記。"""
    i, tag = 0, "$q$"
    while tag in s:
        i += 1
        tag = f"$q{i}$"
    return f"{tag}{s}{tag}"


def lit(col, v):
    if v is None:
        return "null"
    if col in JSON_COLS:
        return dq(json.dumps(v, ensure_ascii=False)) + "::jsonb"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    return dq(str(v))


def to_sql(questions) -> str:
    out = []
    for raw in questions:
        q = {"shuffle": True, **raw}
        vals = ", ".join(lit(c, q.get(c)) for c in COLS)
        sets = ", ".join(f"{c} = excluded.{c}" for c in COLS if c != "id")
        out.append(f"insert into questions ({', '.join(COLS)}) values ({vals})\n"
                   f"on conflict (id) do update set {sets};")
    return "\n".join(out) + "\n"


def main(json_path, sql_path) -> int:
    qs = json.loads(Path(json_path).read_text(encoding="utf-8"))
    Path(sql_path).write_text("-- 自動產生，含標準答案，勿提交勿部署\n" + to_sql(qs), encoding="utf-8", newline="\n")
    return len(qs)


if __name__ == "__main__":
    import sys
    print(main(sys.argv[1], sys.argv[2]), "questions")
