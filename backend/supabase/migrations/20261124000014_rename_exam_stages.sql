-- 經驗柑仔店｜014 三階段考核改名：到職 1 個月．考核、到職 3 個月．考核、到職 6 個月．考核
-- 原名：基礎考核、情境應用考核、綜合考核。只改顯示名稱（exam_stages.name），題數、及格分、難度等設定不動。
-- 網站所有考核名稱都從這張表讀，所以改完全站一起變。可重複執行。
update exam_stages set name = '到職 1 個月．考核' where type = 'm1';
update exam_stages set name = '到職 3 個月．考核' where type = 'm3';
update exam_stages set name = '到職 6 個月．考核' where type = 'm6';
