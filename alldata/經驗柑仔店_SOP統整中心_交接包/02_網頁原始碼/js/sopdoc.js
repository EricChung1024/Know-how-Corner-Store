// sopdoc.js｜SOP 文件：同一份內容模型 sopModel() → 網頁畫面 sopDocHTML() 與 Word sopDocxBlob()，兩者內容一致
// 經驗柑仔店 Know-how Corner Store｜SOP 統整中心 — 範例公司「好物集」與所有資料皆為虛構。

const SOPDOC_CSS = `
.sopdoc{font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;color:#2B1E16;background:#FFF6E6;border:1.5px solid #CDB797;border-radius:16px;padding:24px 22px;line-height:1.65;font-size:16px}
.sopdoc .sd-title{font-family:"Huninn","Noto Sans TC","PingFang TC",sans-serif;font-weight:400;color:#B8452F;font-size:30px;line-height:38px;margin:0 0 4px}
.sopdoc h2{font-family:"Huninn","Noto Sans TC","PingFang TC",sans-serif;font-weight:400;color:#B8452F;font-size:24px;line-height:32px;margin:0 0 6px;scroll-margin-top:120px}
.sopdoc .sd-sec{padding-top:26px}
.sopdoc .sd-sec:first-of-type{padding-top:8px}
.sopdoc .m{color:#5C4636;font-size:14px;line-height:22px;margin:2px 0 8px}
.sopdoc .how{background:#FFF0C2;border:1.5px solid #CDB797;border-radius:12px;padding:10px 14px;margin:12px 0 0}
.sopdoc .how ul{margin:4px 0 0;padding-left:20px}
.sopdoc .tw{overflow-x:auto}
.sopdoc table{border-collapse:collapse;width:100%;background:#FFFFFF;font-size:15px;line-height:24px}
.sopdoc th,.sopdoc td{border:1px solid #CDB797;padding:7px 10px;vertical-align:top;text-align:left}
.sopdoc th{background:#FFE7A3;color:#2B1E16;font-weight:700;font-size:14px}
.sopdoc td.no{white-space:nowrap;font-weight:700;width:6em}
.sopdoc td.s{color:#5C4636;font-size:14px;width:13em}
.sopdoc tr.red td.no{background:#F2D3C4;color:#B8452F}
.sopdoc tr.chg td.r{background:#FFF0C2}
.sopdoc .tip{background:#FFF0C2;border:1.5px solid #CDB797;border-radius:12px;padding:8px 14px;margin:10px 0 0}
.sopdoc .tip .t{font-family:"Huninn","Noto Sans TC",sans-serif;color:#B8452F}
.sopdoc .tag{display:inline-block;font-size:12px;line-height:18px;font-weight:700;border:1px solid #B8452F;color:#B8452F;border-radius:999px;padding:0 8px;background:#FFFFFF;margin-left:6px;white-space:nowrap}
.sopdoc .foot{color:#5C4636;font-size:12px;line-height:18px;margin-top:22px;border-top:1px dashed #CDB797;padding-top:8px}
`;

function sopModel(mode, doc){
  const senior = mode === "senior", live = doc.rules.filter(r => !r.pending), reds = live.filter(r => r.red);
  const ruleCell = r => ({topic: r.topic, text: r.rule, tag: r.byYou || ""});
  const noCell = r => (r.red ? "★ " : "") + r.no;
  const secs = [];
  secs.push({id: "steps", tab: "9 個步驟", title: "處理一位客人的 9 個步驟", desc: "照這個順序看，最後一格會接回第一格。", heads: ["步驟", "什麼時候看"], widths: [1100, 8538],
    rows: DATA.chapters.map(c => ({cls: "", cells: [c.no, {topic: c.name, text: c.desc, sep: "　"}]}))});
  secs.push({id: "red", tab: "★ 紅線", title: "★ 紅線（先背）", desc: "做錯會違法、被客訴或洩漏個資。", heads: ["編號", "規則"], widths: [1300, 8338],
    rows: reds.map(r => ({cls: "red", cells: [noCell(r), ruleCell(r)]}))});
  if (senior) {
    secs.push({id: "dec", tab: "本次確認", title: "這次資深確認了什麼", desc: `${doc.by} 在統整時回答的題目。`, heads: ["編號", "問題", "決定"], widths: [1000, 4838, 3800],
      rows: doc.decisions.map(d => ({cls: "", cells: [d.no, d.ask, d.answer]}))});
    if (doc.pending.length) secs.push({id: "pend", tab: "待補", title: "待補（資深未確認，新人版不會出現）", desc: "", heads: ["編號", "規則"], widths: [1300, 8338],
      rows: doc.pending.map(r => ({cls: "", cells: [r.no, ruleCell(r)]}))});
    const chg = live.filter(r => r.old.length);
    secs.push({id: "chg", tab: "和舊檔不同", title: `和舊檔不一樣的地方（${chg.length} 條）`, desc: "雲端舊檔還在，新人可能會看到。以下舊寫法都已不適用。", heads: ["編號", "現在", "舊檔怎麼寫"], widths: [1000, 4838, 3800],
      rows: chg.map(r => ({cls: "", cells: [r.no, ruleCell(r), {lines: r.old}]}))});
  }
  DATA.chapters.forEach(c => {
    const rs = live.filter(r => r.ch === c.no);
    secs.push({id: "ch" + c.no, tab: `${c.no} ${c.name}`, title: `第 ${c.no} 步　${c.name}`, desc: c.desc,
      heads: senior ? ["編號", "規則", "生效日／依據／確認方式"] : ["編號", "規則"], widths: senior ? [1100, 5638, 2900] : [1300, 8338],
      rows: rs.map(r => ({cls: (r.red ? "red" : "") + (senior && r.old.length ? " chg" : ""), cells: senior ? [noCell(r), ruleCell(r), {lines: [r.eff, r.basis, r.byYou || r.how]}] : [noCell(r), ruleCell(r)]})),
      tips: DATA.tips.filter(t => t.ch === c.no)});
  });
  secs.push({id: "tools", tab: "系統功能", title: "常用系統功能與檔案", desc: "", heads: ["要做什麼", "去哪裡"], widths: [3200, 6438],
    rows: DATA.tools.map(t => ({cls: "", cells: [t.task, t.where]}))});
  if (senior) secs.push({id: "exp", tab: "已失效", title: "已失效、不採用", desc: "保留在版本歷史，AI 問答查得到。", heads: ["項目", "內容"], widths: [2600, 7038],
    rows: [...DATA.expired.map(x => ({cls: "", cells: [x.topic, `${x.text}（${x.until} 到期）`]})), ...DATA.rumors.map(r => ({cls: "", cells: ["傳言（不採用）", `${r.who}：「${r.text}」`]}))]});
  return {
    title: `好物集客服 SOP（${senior ? "主管版" : "新人版"}）`,
    meta: senior ? `確認人：${doc.by}（資深客服專員）` : "",
    how: ["編號「7-9」＝第 7 步的第 9 條。9 個步驟照處理一位客人從頭到尾的順序排。",
          "★ 是紅線：做錯會違法、被客訴或洩漏個資，第一週先背。",
          senior ? "黃底＝和雲端舊檔的寫法不一樣；右欄是生效日、依據和確認方式。" : "看到其他檔案寫的不一樣，以這份為準；還是不確定就問學長姐。"],
    foot: "示範資料：好物集為虛構公司，人名、訂單與數字皆為示範。",
    secs,
  };
}

// ---------- HTML ----------
const sdEsc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function sdCell(c){
  if (typeof c === "string" || typeof c === "number") return sdEsc(c);
  if (c.lines) return c.lines.map(sdEsc).join("<br>");
  return `<b>${sdEsc(c.topic)}</b>${c.sep || "："}${sdEsc(c.text)}${c.tag ? `<span class="tag">${sdEsc(c.tag)}</span>` : ""}`;
}
function sdSection(s, mode){
  const senior = mode === "senior";
  const cls = i => i === 0 && s.heads[0] !== "要做什麼" && s.heads[0] !== "項目" ? "no" : (senior && i === 2 && s.id.startsWith("ch")) || (s.id === "chg" && i === 2) ? "s" : (i === 1 ? "r" : "");
  return `<section class="sd-sec" data-sec="${s.id}" id="sd-${s.id}"><h2>${sdEsc(s.title)}</h2>${s.desc ? `<p class="m">${sdEsc(s.desc)}</p>` : ""}
    <div class="tw"><table><thead><tr>${s.heads.map(h => `<th>${sdEsc(h)}</th>`).join("")}</tr></thead><tbody>
    ${s.rows.map(r => `<tr class="${r.cls}">${r.cells.map((c, i) => `<td class="${cls(i)}">${sdCell(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    ${s.tips && s.tips.length ? `<div class="tip"><span class="t">學長姐小撇步</span>${s.tips.map(t => `<div>・<b>${sdEsc(t.type)}：</b>${sdEsc(t.tip)}</div>`).join("")}</div>` : ""}</section>`;
}
function sopDocHTML(mode, doc, only){
  const m = sopModel(mode, doc);
  const head = `<p class="sd-title">${sdEsc(m.title)}</p>${m.meta ? `<p class="m">${sdEsc(m.meta)}</p>` : ""}<div class="how"><b>怎麼看這份 SOP</b><ul>${m.how.map(x => `<li>${sdEsc(x)}</li>`).join("")}</ul></div>`;
  const secs = m.secs.filter(s => !only || only.includes(s.id));
  return `<article class="sopdoc">${only ? "" : head}${secs.map(s => sdSection(s, mode)).join("")}${only ? "" : `<p class="foot">${sdEsc(m.foot)}</p>`}</article>`;
}
// ---------- Word（.docx）----------
async function sopDocxBlob(mode, doc){
  const X = window.docx;
  if (!X) throw new Error("nolib");
  const {Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, Footer, AlignmentType, PageNumber} = X;
  const m = sopModel(mode, doc), senior = mode === "senior";
  const F = {ascii: "Microsoft JhengHei", eastAsia: "Microsoft JhengHei", hAnsi: "Microsoft JhengHei"};
  const R = (t, o = {}) => new TextRun({text: String(t ?? ""), font: F, size: o.size || 21, bold: !!o.bold, color: o.color || "2B1E16"});
  const P = (runs, o = {}) => new Paragraph({children: Array.isArray(runs) ? runs : (runs && typeof runs === "object") ? [runs] : [R(runs, o)], spacing: {before: o.before || 0, after: o.after ?? 60, line: 300}, keepNext: !!o.keepNext});
  const bd = {style: BorderStyle.SINGLE, size: 4, color: "CDB797"};
  const borders = {top: bd, bottom: bd, left: bd, right: bd};
  const cellParas = (c, head, i, s) => {
    if (head) return [P(R(c, {bold: true, size: 20}))];
    if (typeof c === "string" || typeof c === "number") return [P(R(c, {size: 20, bold: i === 0 && s.id !== "tools" && s.id !== "exp", color: i === 0 && String(c).startsWith("★") ? "B8452F" : "2B1E16"}))];
    if (c.lines) return c.lines.map(l => P(R(l, {size: 18, color: "5C4636"}), {after: 20}));
    const runs = [R(c.topic, {bold: true, size: 20}), R((c.sep || "：") + c.text, {size: 20})];
    if (c.tag) runs.push(R(`　〔${c.tag}〕`, {size: 18, color: "B8452F", bold: true}));
    return [P(runs)];
  };
  const fillOf = (row, i, s) => row.cls.includes("red") && i === 0 ? "F2D3C4" : row.cls.includes("chg") && i === 1 ? "FFF0C2" : undefined;
  const table = s => new Table({
    width: {size: s.widths.reduce((a, b) => a + b, 0), type: WidthType.DXA}, columnWidths: s.widths,
    rows: [new TableRow({tableHeader: true, cantSplit: true, children: s.heads.map((h, i) => new TableCell({width: {size: s.widths[i], type: WidthType.DXA}, borders, margins: {top: 60, bottom: 60, left: 100, right: 100}, shading: {type: ShadingType.CLEAR, color: "auto", fill: "FFE7A3"}, children: cellParas(h, true)}))}),
      ...s.rows.map(row => new TableRow({cantSplit: true, children: row.cells.map((c, i) => new TableCell({width: {size: s.widths[i], type: WidthType.DXA}, borders, margins: {top: 60, bottom: 60, left: 100, right: 100},
        shading: fillOf(row, i, s) ? {type: ShadingType.CLEAR, color: "auto", fill: fillOf(row, i, s)} : undefined, children: cellParas(c, false, i, s)}))}))],
  });
  const body = [
    P(R(m.title, {size: 40, color: "B8452F"}), {after: m.meta ? 80 : 160}),
    ...(m.meta ? [P(R(m.meta, {size: 19, color: "5C4636"}), {after: 160})] : []),
    new Table({width: {size: 9638, type: WidthType.DXA}, columnWidths: [9638], rows: [new TableRow({children: [new TableCell({width: {size: 9638, type: WidthType.DXA}, borders, margins: {top: 100, bottom: 100, left: 160, right: 160}, shading: {type: ShadingType.CLEAR, color: "auto", fill: "FFF0C2"},
      children: [P(R("怎麼看這份 SOP", {bold: true})), ...m.how.map(h => P(R("・" + h, {size: 20})))]})]})]}),
  ];
  m.secs.forEach(s => {
    body.push(P(R(s.title, {size: 30, color: "B8452F"}), {before: 320, after: 60, keepNext: true}));
    if (s.desc) body.push(P(R(s.desc, {size: 19, color: "5C4636"}), {after: 100, keepNext: true}));
    body.push(table(s));
    if (s.tips && s.tips.length) {
      body.push(P("", {after: 60}));
      body.push(new Table({width: {size: 9638, type: WidthType.DXA}, columnWidths: [9638], rows: [new TableRow({children: [new TableCell({width: {size: 9638, type: WidthType.DXA}, borders, margins: {top: 80, bottom: 80, left: 160, right: 160}, shading: {type: ShadingType.CLEAR, color: "auto", fill: "FFF0C2"},
        children: [P(R("學長姐小撇步", {bold: true, color: "B8452F"})), ...s.tips.map(t => P([R("・" + t.type + "：", {bold: true, size: 20}), R(t.tip, {size: 20})]))]})]})]}));
    }
  });
  body.push(P(R(m.foot, {size: 17, color: "5C4636"}), {before: 300}));
  const d = new Document({
    creator: doc.by, title: m.title,
    styles: {default: {document: {run: {font: F, size: 21, color: "2B1E16"}}}},
    sections: [{properties: {page: {size: {width: 11906, height: 16838}, margin: {top: 1134, bottom: 1134, left: 1134, right: 1134}}},
      footers: {default: new Footer({children: [new Paragraph({alignment: AlignmentType.CENTER, children: [R(`${m.title}｜第 `, {size: 16, color: "5C4636"}), new TextRun({children: [PageNumber.CURRENT], font: F, size: 16, color: "5C4636"}), R(" 頁", {size: 16, color: "5C4636"})]})]})},
      children: body}],
  });
  return Packer.toBlob(d);
}

// 把 SOP 文件樣式放進頁面（網頁畫面用）
if (typeof document !== "undefined" && !document.getElementById("sopdoc-css")) {
  const st = document.createElement("style"); st.id = "sopdoc-css"; st.textContent = SOPDOC_CSS; document.head.appendChild(st);
}
