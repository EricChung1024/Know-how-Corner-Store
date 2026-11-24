# test_flow.py｜自動跑一次完整流程，確認網頁沒有壞掉（選用；改完程式後跑一次最安心）
# 需要：pip install playwright  然後  playwright install chromium
# 用法：python tools/test_flow.py                     → 測 index.html（原始碼版）
#       python tools/test_flow.py dist/SOP統整中心.html  → 測單一檔版本
# 會檢查：第一次使用鎖定、匯入 9 個檔、統整、12 項確認、產生主管版、匯出 Word、新人看不到主管內容、重設示範。
# 匯出的 Word 會存在 dist/test_output/。
import os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

SRC = Path(__file__).resolve().parents[1]
PAGE = (SRC / (sys.argv[1] if len(sys.argv) > 1 else "index.html")).resolve()
OUT = SRC / "dist" / "test_output"
OUT.mkdir(parents=True, exist_ok=True)
DOCX_LOCAL = os.environ.get("DOCX_LOCAL")   # 沒有網路時，可指定 docx 套件的本機 index.umd.js
results, errors = [], []


def check(name, ok):
    results.append((name, bool(ok)))
    print(("通過　" if ok else "失敗　") + name)


def login(pg, role):
    pg.click(f'.xk-seg button[data-r={role}]'); pg.click('#fillDemo'); pg.click('button[type=submit]'); pg.wait_for_timeout(400)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 760}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    if DOCX_LOCAL:
        pg.route("**/cdn.jsdelivr.net/npm/docx@8.5.0/**", lambda r: r.fulfill(path=DOCX_LOCAL, content_type="application/javascript"))
    pg.goto(PAGE.as_uri()); pg.wait_for_timeout(600)
    check("登入頁一個畫面看完（不用捲動）", pg.evaluate("document.documentElement.scrollHeight <= innerHeight + 2"))

    login(pg, "newbie")
    check("主管還沒統整時，新人看到「還在準備中」", "還在準備中" in pg.inner_text("#app"))
    pg.click("#logout"); login(pg, "manager")
    check("第一次使用：主管版 SOP 鎖住", pg.locator("nav button:disabled").count() == 1)

    pg.click("#loadDemo"); pg.wait_for_timeout(200)
    check("載入示範資料後列出 9 個檔", pg.locator("#ftable tbody tr").count() == 9)
    pg.click("#start"); pg.wait_for_timeout(1200)
    pg.click("nav [data-go=flow]"); pg.wait_for_timeout(300)
    check("切走再回來仍在第 2 格", "第 2 格" in pg.inner_text(".phead"))
    pg.wait_for_timeout(3200); pg.click("#goConfirm"); pg.wait_for_timeout(300)
    check("沒確認完前「產生主管版 SOP」鎖住", pg.locator("#glock button:disabled").count() == 1)
    for _ in range(4):
        pg.click("#ok"); pg.wait_for_timeout(80)
    for _ in range(8):
        pg.click("#fill"); pg.click("#ok"); pg.wait_for_timeout(80)
    check("12 項都確認完", "12 項都確認了" in pg.inner_text(".phead"))
    pg.click('[data-step="1"]'); pg.wait_for_timeout(200)
    check("可點進度路回到第 1 格，檔案還在", pg.locator("#ftable tbody tr").count() == 9)
    pg.click('[data-step="3"]'); pg.wait_for_timeout(200)
    pg.click("#gen"); pg.wait_for_timeout(500)
    check("產生後進入主管版 SOP、導覽列解鎖", pg.locator("nav button:disabled").count() == 0 and "主管版 SOP" in pg.inner_text(".phead"))
    pg.fill("#find", "退款"); pg.wait_for_timeout(200)
    check("搜尋「退款」有結果", pg.locator("#docbox mark").count() > 0)
    pg.fill("#find", "")
    try:
        with pg.expect_download(timeout=15000) as dl:
            pg.click("#exDocx")
        dl.value.save_as(OUT / dl.value.suggested_filename)
        check("匯出主管版 Word：" + dl.value.suggested_filename, dl.value.suggested_filename.endswith(".docx"))
    except Exception as e:
        check("匯出主管版 Word（需要網路載入 docx 套件）", False)

    pg.click("#logout"); login(pg, "newbie")
    text = pg.inner_text("#app")
    leaks = [w for w in ["本次確認", "和舊檔不同", "已失效", "待補", "林佩珊", "生效日"] if w in text]
    check("新人畫面沒有主管內容與主管名字" + (f"（出現：{leaks}）" if leaks else ""), not leaks)
    pg.click('[data-tab=all]'); pg.wait_for_timeout(200)
    t2 = pg.inner_text("#docbox")
    check("新人整份 SOP 沒有時間、確認人", "確認人" not in t2 and "林佩珊" not in t2)
    try:
        with pg.expect_download(timeout=15000) as dl:
            pg.click("#exDocx")
        dl.value.save_as(OUT / dl.value.suggested_filename)
        check("匯出新人版 Word：" + dl.value.suggested_filename, dl.value.suggested_filename.endswith(".docx"))
    except Exception:
        check("匯出新人版 Word（需要網路載入 docx 套件）", False)

    pg.click("#logout"); pg.click("#resetDemo"); pg.click("#resetDemo"); pg.wait_for_timeout(200); login(pg, "manager")
    check("重設示範後主管版 SOP 再次鎖住", pg.locator("nav button:disabled").count() == 1)

    m = b.new_context(viewport={"width": 390, "height": 844}).new_page()
    m.goto(PAGE.as_uri()); m.wait_for_timeout(400)
    check("手機寬度不會左右捲動", m.evaluate("document.documentElement.scrollWidth <= 390"))
    b.close()

check("沒有 JavaScript 錯誤" + (f"：{errors}" if errors else ""), not errors)
failed = [n for n, ok in results if not ok]
print(f"\n共 {len(results)} 項，失敗 {len(failed)} 項")
sys.exit(1 if failed else 0)
