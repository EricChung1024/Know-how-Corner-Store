// 驗證 backend/tools/apply-exam-sop-mapping.sql：只補空的 sop、不動已標示的、不動信心低／無對應的，且不會被 question_bank_guard 擋住（用後台 SQL 角色執行）。
// 用法：node backend/tests/exam-sop-mapping.test.mjs <專案根目錄> <pglite 資料夾>
import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { setup, S } from './_harness.mjs';
const [, , root, pgliteDir] = process.argv;
const { db, as, sup, deny } = await setup(root, pgliteDir, []);

const row = (id, caseId, source, qtype, kind, sop) =>
  `insert into question_bank (id, source, kind, case_id, chapter, qtype, level, stem, options, sop, sop_rules) values
   ('${id}', '${source}', '${kind}', ${caseId ? `'${caseId}'` : 'null'}, 7, '${qtype}', 1, '題幹', ${qtype === 'short' ? 'null' : `'["A","B"]'::jsonb`}, ${sop ? `'${sop}'` : 'null'}, ${sop ? `array['${sop}']` : `'{}'`});`;
await db.exec([
  row('L-1', 'C065', 'legacy', 'short', '情境簡答', null),   // 信心高 → 補 7-9
  row('L-2', 'C065', 'legacy', 'mcq', '最佳回覆', null),
  row('L-3', 'C065', 'legacy', 'short', '情境簡答', '2-2'),  // 已標示 → 不能被覆蓋
  row('L-4', 'C097', 'legacy', 'short', '情境簡答', null),   // 信心中 → 補 7-7
  row('L-5', 'C019', 'legacy', 'short', '情境簡答', null),   // 信心低 → 預設不動
  row('L-6', 'C012', 'legacy', 'short', '情境簡答', null),   // 無對應 → 不動
  row('RU-R01', null, 'rules', 'tf', '傳言辨識', null),      // 規則題，信心高 → 7-9
  row('TIP-X04', null, 'rules', 'mcq', '客人應對', null),    // 話術題，無對應 → 不動
].join('\n'));

const sqlFile = fs.readFileSync(path.join(root, 'backend/tools/apply-exam-sop-mapping.sql'), 'utf8');
assert.ok(!/^\s*update[^;]*;/im.test(sqlFile.split('-- ===== 區塊 B')[1].replace(/^--.*$/gm, '')), '區塊 B 預設要被註解掉');
await db.exec(sqlFile);
const get = async id => (await sup(`select sop, sop_rules from question_bank where id = '${id}'`))[0];

assert.deepEqual(await get('L-1'), { sop: '7-9', sop_rules: ['7-9', '7-10'] });
assert.deepEqual(await get('L-2'), { sop: '7-9', sop_rules: ['7-9', '7-10'] });
assert.deepEqual(await get('L-3'), { sop: '2-2', sop_rules: ['2-2'] });                 // 已標示的不動
assert.equal((await get('L-4')).sop, '7-7');
assert.equal((await get('L-5')).sop, null);                                              // 信心低：預設不動
assert.equal((await get('L-6')).sop, null);                                              // 無對應：不動
assert.equal((await get('RU-R01')).sop, '7-9');
assert.equal((await get('TIP-X04')).sop, null);

// 可重複執行，結果不變
await db.exec(sqlFile);
assert.deepEqual(await get('L-1'), { sop: '7-9', sop_rules: ['7-9', '7-10'] });

// 資深（登入角色）仍然不能改 sop——這個保護不能因為這個檔案而被破壞
await db.exec(`grant select, update on question_bank to authenticated;`);
await as(S, () => deny(db.query(`update question_bank set sop = '1-1' where id = 'L-6'`), /ONLY_STATUS/));

console.log('exam-sop-mapping.test.mjs 通過');
