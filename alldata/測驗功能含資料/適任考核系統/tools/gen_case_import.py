"""把 100 個案例壓縮成「案例層級」資料，產生由資料庫展開成 700 題的 SQL（資料量比逐題小很多）。
產物含標準答案，只放 tools/out/（已 gitignore），勿提交勿部署。"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_questions as bq  # noqa: E402
from xlsx_reader import read_sheet  # noqa: E402

TOPIC_FIELDS = ["check", "boundary", "reply", "next", "escalate"]
ABILITY_ORDER = ["查核", "判斷", "回覆", "處理", "升級"]


def _rd(name):
    with (ROOT / "AI專屬客服測驗" / name).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def build_payload():
    """回傳 (prompts, cases)。cases 內每個案例一個 dict，鍵名刻意縮短。"""
    rules = read_sheet(str(ROOT / "統整結果_標準答案總表.xlsx"), "規則總表")
    rule_text = {r["編號"]: bq.clean(r["最新版規則"]).rstrip("。") for r in rules if r["狀態"] == "現行"}
    red = {r["編號"]: r["紅線"] == "★" for r in rules if r["狀態"] == "現行"}
    short, mcq, multi = (_rd("電商客服_生活化情境500題_含得分點.csv"), _rd("電商客服_最佳回覆選擇題100.csv"),
                         _rd("電商客服_多輪追問題100.csv"))
    case_map = bq.load_case_map()
    prompts, cases = [], []
    for n in range(1, 101):
        cid = f"C{n:03d}"
        srows = {r["能力面向"]: r for r in short if r["案例編號"] == cid}
        mrow = next(r for r in mcq if r["案例編號"] == cid)
        drow = next(r for r in multi if r["案例編號"] == cid)
        scene = srows["查核"]["生活情境"]
        p_idx = []
        for ab in ABILITY_ORDER:
            q = srows[ab]["題目"].split("\n\n")[-1]
            if q not in prompts:
                prompts.append(q)
            p_idx.append(prompts.index(q))
        opts = re.findall(r"^[ABC]\. (.*)$", mrow["題目"], re.M)
        ci = "ABC".index(mrow["正確答案"])
        m = re.search(r"【第一輪】(.*?)\n你的回覆：「(.*?)」\n\n【第二輪】顧客接著說：「(.*?)」", drow["題目"], re.S)
        assert m[1] == scene, cid
        assert mrow["題目"].split("\n", 1)[1].split("\n\n")[0] == scene, cid
        e = case_map.get(cid)
        c = {"n": n, "st": None, "sc": scene, "p": p_idx, "fu": m[3], "ke": mrow["關鍵失誤"]}
        if e:   # 有對應總表規則：總表延伸
            opts[ci] = e["mcq"]
            ids = e["rules"]
            c.update(st=bq.stage_of(ids[0]), r=ids, rl=any(red[i] for i in ids), f=[e[k] for k in TOPIC_FIELDS], o=opts, c=ci,
                     x=f"對應總表規則 {'、'.join(ids)}：{rule_text[ids[0]]}。判斷重點：{e['boundary']}")
        else:   # 維持舊內容（未對應總表）
            assert m[2] == opts[ci], cid   # 多輪題的「先前回覆」就是選擇題的正確選項
            c.update(st=bq.TOPIC_TO_STAGE[mrow["主題"]], f=[srows[ab]["參考答案"] for ab in ABILITY_ORDER], o=opts, c=ci,
                     x=mrow["解析"], mr=drow["參考答案"])
        cases.append(c)
    return prompts, cases


EXPAND = r"""
with d as (select $j${prompts}$j$::jsonb as prompts, $j${cases}$j$::jsonb as cases),
cs as (
  select c, (c ->> 'n')::int as n, (c ? 'r') as fused, coalesce((c ->> 'rl')::boolean, false) as rl,
         array(select jsonb_array_elements_text(c -> 'r')) as r, d.prompts
  from d, jsonb_array_elements(d.cases) c
),
q as (
  -- 5 題簡答
  select 'L-L' || lpad(((n - 1) * 5 + k)::text, 3, '0') as id, (c ->> 'st')::int as stage, 'short' as qtype,
         (c ->> 'sc') || E'\n\n' || (prompts ->> (c -> 'p' ->> (k - 1))::int) as stem,
         null::jsonb as options, null::int as correct_index,
         case when fused then (c -> 'f' ->> (k - 1)) || '（對應總表規則 ' || array_to_string(r, '、') || '）' else c -> 'f' ->> (k - 1) end as explanation,
         c -> 'f' ->> (k - 1) as reference_answer,
         case when fused then to_jsonb(array(select btrim(x) from unnest(string_to_array(c -> 'f' ->> (k - 1), '；')) x where btrim(x) <> ''))
              else jsonb_build_array(c -> 'f' ->> (k - 1)) end as rubric,
         (c ->> 'ke') || '（出現即另標記，交主管覆核）' as ke,
         fused, rl, n, c, ('L' || lpad(((n - 1) * 5 + k)::text, 3, '0')) as legacy_ref, r
  from cs, generate_series(1, 5) k
  union all
  -- 1 題選擇
  select 'L-M' || lpad(n::text, 3, '0'), (c ->> 'st')::int, 'mcq',
         (c ->> 'sc') || E'\n\n以下哪一個回覆最適合？', c -> 'o', (c ->> 'c')::int, c ->> 'x', null, null::jsonb,
         c ->> 'ke',
         fused, rl, n, c, 'M' || lpad(n::text, 3, '0'), r
  from cs
  union all
  -- 1 題多輪追問（簡答）
  select 'L-D' || lpad(n::text, 3, '0'), (c ->> 'st')::int, 'short',
         '【第一輪】' || (c ->> 'sc') || E'\n你先前的回覆：「' || (c -> 'o' ->> (c ->> 'c')::int) || E'」\n\n【第二輪】顧客接著說：「' || (c ->> 'fu') || E'」\n請寫出你的第二輪回覆。',
         null, null,
         case when fused then (c -> 'f' ->> 2) || '；' || (c -> 'f' ->> 1) || '（對應總表規則 ' || array_to_string(r, '、') || '）' else c ->> 'mr' end,
         case when fused then (c -> 'f' ->> 2) || '；' || (c -> 'f' ->> 1) else c ->> 'mr' end,
         case when fused then jsonb_build_array(c -> 'f' ->> 2, c -> 'f' ->> 1) else jsonb_build_array(c ->> 'mr') end,
         c ->> 'ke',
         fused, rl, n, c, 'D' || lpad(n::text, 3, '0'), r
  from cs
)
insert into questions (id, stage, qtype, stem, options, correct_index, explanation, error_type, error_detail, option_errors,
                       reference_answer, rubric, key_error, source, source_ref, reviewed, red_line, shuffle)
select id, stage, qtype, stem, options, correct_index, explanation,
       case when fused and rl then '違反紅線' else '情境判斷失誤' end,
       ke, null,
       reference_answer, rubric, case when qtype = 'short' then ke end,
       case when fused then 'rules_ext' else 'legacy' end,
       case when fused then 'C' || lpad(n::text, 3, '0') || ':' || array_to_string(r, '+') else legacy_ref end,
       false, fused and rl, case when qtype = 'mcq' and not fused then false else true end
from q
on conflict (id) do update set stage = excluded.stage, qtype = excluded.qtype, stem = excluded.stem, options = excluded.options,
  correct_index = excluded.correct_index, explanation = excluded.explanation, error_type = excluded.error_type,
  error_detail = excluded.error_detail, reference_answer = excluded.reference_answer, rubric = excluded.rubric,
  key_error = excluded.key_error, source = excluded.source, source_ref = excluded.source_ref,
  reviewed = excluded.reviewed, red_line = excluded.red_line, shuffle = excluded.shuffle;
"""


def expand_sql(prompts, cases):
    pj = json.dumps(prompts, ensure_ascii=False, separators=(",", ":"))
    # 每個案例一行，方便人工檢視與分段貼上
    cj = "[\n" + ",\n".join(json.dumps(c, ensure_ascii=False, separators=(",", ":")) for c in cases) + "\n]"
    assert "$j$" not in pj + cj
    return EXPAND.replace("{prompts}", pj).replace("{cases}", cj)


def main(out_dir, chunk=25):
    prompts, cases = build_payload()
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    files = []
    for i in range(0, len(cases), chunk):
        f = out / f"case_import_{i // chunk + 1}.sql"
        f.write_text(expand_sql(prompts, cases[i:i + chunk]), encoding="utf-8", newline="\n")
        files.append(f)
    return len(cases), files


if __name__ == "__main__":
    n, files = main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "適任考核系統" / "tools" / "out"))
    print(n, "cases ->", [f.name for f in files])
