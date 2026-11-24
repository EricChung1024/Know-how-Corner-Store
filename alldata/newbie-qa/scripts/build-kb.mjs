// 把婉萱維護的 sop_latest.json、sop_history.json，加上 data/examples.json，
// 轉成新人問答亭用的知識庫 kb.json，輸出到兩個地方：
//   web/kb.json                                  → 前端顯示規則卡、分類、範例題
//   supabase/functions/xiaoju-answer/kb.json     → Edge Function 組提示詞給 Gemini
//
// 用法（在 newbie-qa 資料夾）：node scripts/build-kb.mjs
// 這支程式只「讀」SOP 檔，不修改；SOP 內容要改，請先在 Discord 告知婉萱，由她更新原檔。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const need = ["data/sop_latest.json", "data/sop_history.json", "data/examples.json"];
for (const f of need) {
  if (!existsSync(join(root, f))) {
    console.error(`找不到 ${f}。請先把專案裡的 sop_latest.json、sop_history.json 放進 data/ 資料夾。`);
    process.exit(1);
  }
}
const read = (f) => JSON.parse(readFileSync(join(root, f), "utf8"));
const latest = read("data/sop_latest.json");
const history = read("data/sop_history.json");
const { examples } = read("data/examples.json");

const histById = Object.fromEntries(history.rules.map((r) => [r.id, r]));
const pickVersions = (h) =>
  (h?.versions || []).map((v) => ({ label: v.label, date: v.date, text: v.text, status: v.status, note: v.note || "" }));

// 現行規則：以 sop_latest.json 為準
const rules = latest.rules.map((r) => ({
  no: r.no,
  code: r.id,
  topic: r.topic,
  chapter: r.chapter,
  rule: r.rule,
  red: !!r.red_line,
  status: "現行",
  since: r.detail?.effective || "",
  basis: r.detail?.basis || "",
  law: r.detail?.law || "",
  expires: "",
  tips: r.tips || [],
  versions: pickVersions(histById[r.id]),
}));

// 已失效的暫時規則：只在 sop_history.json 裡（編號為「—」）
const latestIds = new Set(latest.rules.map((r) => r.id));
history.rules
  .filter((h) => !latestIds.has(h.id))
  .forEach((h) => {
    if (h.status !== "已失效") {
      console.warn(`注意：${h.id}「${h.topic}」只在 sop_history.json，狀態是「${h.status}」，請向婉萱確認。`);
    }
    rules.push({
      no: h.no,
      code: h.id,
      topic: h.topic,
      chapter: "",
      rule: h.latest,
      red: false,
      status: h.status,
      since: h.versions?.[0]?.date || "",
      basis: h.versions?.[0]?.label || "",
      law: "",
      expires: h.expires || "",
      tips: [],
      versions: pickVersions(h),
    });
  });

// 範例只保留引用到現存規則的題目
const allNos = new Set(rules.map((r) => (r.no !== "—" ? r.no : r.code)));
const okExamples = examples.filter((e) => {
  const no = (e.latest || "").replace(/^SOP\s*/, "").split(" ")[0];
  if (!allNos.has(no)) console.warn(`範例 ${e.id} 引用的 ${no} 不在最新 SOP，已略過。`);
  return allNos.has(no);
});

const kb = {
  version: latest.meta.version,
  run_date: latest.meta.run_date,
  confirmed_by: latest.meta.confirmed_by,
  chapters: Object.fromEntries(latest.chapters.map((c) => [c.no, c.name])),
  rules,
  tips: latest.tips.map((t) => ({ code: t.id, chapter: t.chapter, who: t.customer_type, how: t.tip, rel: t.related || [] })),
  rumors: (history.rumors || []).map((r) => ({ code: r.id, rel: r.related_no, date: r.date, who: r.who, text: r.text, handle: r.note })),
  examples: okExamples,
};

const out = JSON.stringify(kb);
writeFileSync(join(root, "web/kb.json"), out);
writeFileSync(join(root, "supabase/functions/xiaoju-answer/kb.json"), out);
console.log(
  `完成：SOP ${kb.version}｜現行 ${rules.filter((r) => r.status === "現行").length} 條、已失效 ${rules.filter((r) => r.status !== "現行").length} 條｜經驗談 ${kb.tips.length} 則｜傳言 ${kb.rumors.length} 則｜範例 ${okExamples.length} 題`,
);
